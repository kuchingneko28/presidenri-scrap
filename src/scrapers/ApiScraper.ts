import pLimit from "p-limit";
import { BaseScraper } from "./BaseScraper";
import { API_BASE, WWW_DOMAIN, BETA_DOMAIN, DOWNLOAD_CONCURRENCY } from "../config/constants";
import { decodeHtmlEntities } from "../utils";
import { MediaParser } from "../utils/MediaParser";
import type { WordPressPost, WordPressMedia } from "../types/wordpress";

export class ApiScraper extends BaseScraper {
  async scrape(): Promise<void> {
    const perPage = this.options.perPage || 100;
    let page = this.options.startPage || 1;
    let stopScraper = false;

    this.stats.state = "scraping";
    this.logger.startSpinner("Starting API Scrape...");

    while (!stopScraper && !this.isShuttingDown) {
      this.updateStats({ page });
      let url = `${API_BASE}/photo?per_page=${perPage}&page=${page}&_embed`;
      if (this.options.before) {
        let beforeStr = String(this.options.before);
        if (beforeStr.length === 4) beforeStr += "-12-31";
        url += `&before=${beforeStr}T23:59:59`;
      }
      if (this.options.search) {
        url += `&search=${encodeURIComponent(this.options.search)}`;
      }

      try {
        const response = await this.network.fetch(url, { verbose: this.options.verbose });
        if (!response.ok) {
          if (response.status === 400) break;
          throw new Error(`API returned ${response.status}`);
        }

        const total = response.headers.get("X-WP-Total");
        if (total) this.stats.total = parseInt(total);

        const posts = (await response.json()) as WordPressPost[];
        if (posts.length === 0) break;

        const limit = pLimit(DOWNLOAD_CONCURRENCY);
        const pagePromises = posts.map(post => limit(async () => {
          if (this.isShuttingDown) return;
          if (this.options.limit && this.stats.found >= this.options.limit) {
            stopScraper = true;
            return;
          }
          if (this.options.since && post.date < this.options.since) {
            stopScraper = true;
            return;
          }

          const title = decodeHtmlEntities(post.title.rendered);
          const excerpt = decodeHtmlEntities(post.excerpt.rendered);
          if (!this.matchesFilter(title) && !this.matchesFilter(excerpt)) return;

          const saved = await this.processPost(post);
          if (saved) {
            this.stats.found++;
            if (this.options.verbose) {
              this.logger.success(`Saved: ${decodeHtmlEntities(post.title.rendered)}`);
            }
            if (this.stats.found % 10 === 0) this.updateStats({});
          } else if (this.options.verbose) {
            this.logger.info(`Skipped (already up to date): ${decodeHtmlEntities(post.title.rendered)}`);
          }
        }));

        await Promise.all(pagePromises);
        page++;
      } catch (error) {
        this.logger.error(`Error on page ${page}: ${error}`);
        break;
      }
    }

    this.stats.state = "downloading";
    this.updateStats({});
    
    // Wait for all downloads to finish if we are in download mode
    if (this.options.download) {
        await this.waitForDownloads();
    }

    this.logger.stopSpinner();
    this.logger.success(`API Scraping completed. Found ${this.stats.found} new articles.`);
  }

  private async processPost(post: WordPressPost): Promise<boolean> {
    const postId = post.id;
    const savedModified = this.db.getArticleModifiedDate(postId);

    if (!this.options.force && savedModified === post.modified) {
      if (this.options.download) {
        this.downloadExistingImages(postId);
      }
      return false;
    }

    let images: string[] = [];
    try {
      images = await this.extractImages(post);
    } catch (e) {
      if (this.options.verbose) {
        this.logger.warn(`Failed to fetch media for post ${postId}: ${e}`);
      }
      throw e;
    }

    const date = post.date.substring(0, 10);
    const description = decodeHtmlEntities(post.excerpt.rendered.replace(/<[^>]*>/g, "").trim());
    const title = decodeHtmlEntities(post.title.rendered);

    this.db.saveArticle({
      post_id: postId,
      link: post.link,
      title,
      date,
      description,
      tags: ["Foto"],
      images,
      modified: post.modified,
    });

    if (this.options.download) {
      images.forEach((img, idx) => {
        this.downloader.download({ title, date, imageUrl: img, index: idx, postUrl: post.link }, this.options.verbose);
      });
    }

    return true;
  }

  private downloadExistingImages(postId: number): void {
    const article = this.db.getArticleByPostId(postId);
    if (article) {
      article.images.forEach((img, idx) => {
        this.downloader.download({
          title: article.title,
          date: article.date,
          imageUrl: img,
          index: idx,
          postUrl: article.link,
        }, this.options.verbose);
      });
    }
  }

  private async extractImages(post: WordPressPost): Promise<string[]> {
    const images: string[] = [];
    
    await this.getMediaAttachments(post.id, images);
    
    // Try resolving featured media from embed first to avoid network request
    const featuredUrl = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url || 
                        post._embedded?.["wp:featuredmedia"]?.[0]?.guid?.rendered;
                        
    if (featuredUrl) {
      const cleanUrl = featuredUrl.replace(BETA_DOMAIN, WWW_DOMAIN).replace("/assets/uploads/", "/uploads/");
      if (!images.includes(cleanUrl)) images.push(cleanUrl);
    } else {
      await this.getFeaturedMedia(post.featured_media, images);
    }
    
    if (images.length === 0) {
      this.getHtmlFallbackImages(post, images);
      if (images.length === 0) this.getYoastFallbackImages(post, images);
    }
    
    return images;
  }

  private addMediaUrls(item: WordPressMedia, images: string[]): void {
    // Use original_image (WP 5.3+) for the direct full-res upload URL
    const file = item.media_details?.file;
    const original = item.media_details?.original_image;
    if (file && original) {
      const dir = file.substring(0, file.lastIndexOf("/") + 1);
      const url = `https://${WWW_DOMAIN}/uploads/${dir}${original}`;
      if (!images.includes(url)) images.push(url);
    }

    // guid.rendered often has /assets/uploads/ which always 404s — strip /assets/
    const imageUrl = item.guid?.rendered;
    if (imageUrl) {
      const clean = imageUrl
        .replace(BETA_DOMAIN, WWW_DOMAIN)
        .replace("/assets/uploads/", "/uploads/");
      if (!images.includes(clean)) images.push(clean);
    }
  }

  private async getMediaAttachments(postId: number, images: string[]): Promise<void> {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const mediaUrl = `${API_BASE}/media?parent=${postId}&per_page=100&page=${page}`;
      const mediaResponse = await this.network.fetch(mediaUrl, { verbose: this.options.verbose });
      
      if (mediaResponse.ok) {
        const mediaItems = await mediaResponse.json() as WordPressMedia[];
        for (const item of mediaItems) {
          this.addMediaUrls(item, images);
        }
        if (mediaItems.length < 100) hasMore = false;
        else page++;
      } else {
        hasMore = false;
      }
    }
  }

  private async getFeaturedMedia(mediaId: number, images: string[]): Promise<void> {
    if (mediaId <= 0) return;
    const featuredUrl = `${API_BASE}/media/${mediaId}`;
    const response = await this.network.fetch(featuredUrl, { verbose: this.options.verbose });
    if (response.ok) {
      const item = await response.json() as WordPressMedia;
      this.addMediaUrls(item, images);
    }
  }

  private getHtmlFallbackImages(post: WordPressPost, images: string[]): void {
    if (!post.content?.rendered) return;
    if (this.options.verbose) this.logger.info(`Primary media empty for post ${post.id}, checking HTML content fallback...`);
    const extracted = MediaParser.extractFromHtml(post.content.rendered);
    extracted.forEach(img => {
      if (!images.includes(img)) images.push(img);
    });
  }

  private getYoastFallbackImages(post: WordPressPost, images: string[]): void {
    if (!post.yoast_head_json?.og_image) return;
    if (this.options.verbose) this.logger.info(`Still no images for post ${post.id}, checking Yoast SEO fallback...`);
    
    const ogImages = Array.isArray(post.yoast_head_json.og_image) 
      ? post.yoast_head_json.og_image 
      : [post.yoast_head_json.og_image];
    
    for (const og of ogImages) {
      if (og.url && !images.includes(og.url)) {
        images.push(og.url.replace(BETA_DOMAIN, WWW_DOMAIN));
      }
    }
  }
}
