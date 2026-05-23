import pLimit from "p-limit";
import { BaseScraper } from "./BaseScraper";
import { DEFAULT_SINCE } from "../config/constants";
import { decodeHtmlEntities } from "../utils";
import { MediaParser } from "../utils/MediaParser";
import type { WordPressPost, WordPressMedia } from "../types/wordpress";
import type { DownloadItem } from "../types";

export class ApiScraper extends BaseScraper {
  async scrape(): Promise<void> {
    const perPage = this.options.perPage || 100;
    let page = this.options.startPage || 1;
    let stopScraper = false;
    const downloadPromises: Promise<void>[] = [];

    this.stats.state = "scraping";
    this.logger.startSpinner("Starting API Scrape...");

    while (!stopScraper && !this.isShuttingDown) {
      this.updateStats({ page });
      let url = `https://presidenri.go.id/wp-json/wp/v2/photo?per_page=${perPage}&page=${page}&_embed`;
      if (this.options.before) {
        let beforeStr = String(this.options.before);
        if (beforeStr.length === 4) {
          beforeStr += "-12-31"; // Default to end of year if only year is provided
        }
        url += `&before=${beforeStr}T23:59:59`;
      }
      if (this.options.search) {
        url += `&search=${encodeURIComponent(this.options.search)}`;
      }
      
      let retries = 3;
      let success = false;

      for (let i = 0; i < retries; i++) {
        try {
          const response = await this.network.fetch(url, { verbose: this.options.verbose });
          if (!response.ok) {
            if (response.status === 400) {
              stopScraper = true;
              success = true;
              break;
            }
            throw new Error(`API returned ${response.status}`);
          }

          const total = response.headers.get("X-WP-Total");
          if (total) this.stats.total = parseInt(total);

          const posts = (await response.json()) as WordPressPost[];
          if (posts.length === 0) {
            stopScraper = true;
            success = true;
            break;
          }

          const limit = pLimit(5);
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
            if (!this.matchesFilter(title) && !this.matchesFilter(excerpt)) {
              return;
            }

            const saved = await this.processPost(post);
            if (saved) {
              this.stats.found++;
              if (this.options.verbose) {
                this.logger.success(`Saved: ${decodeHtmlEntities(post.title.rendered)}`);
              }
              if (this.stats.found % 10 === 0) {
                this.updateStats({});
              }
            } else if (this.options.verbose) {
              this.logger.info(`Skipped (already up to date): ${decodeHtmlEntities(post.title.rendered)}`);
            }
          }));

          await Promise.all(pagePromises);
          page++;
          success = true;
          break;
        } catch (error) {
          if (i === retries - 1) {
            this.logger.error(`Error on page ${page}: ${error}`);
            stopScraper = true; // Stop if final retry fails
          } else {
            this.logger.warn(`Retry ${i + 1}/${retries} for page ${page} after error: ${error}`);
            await new Promise(r => setTimeout(r, 2000 * (i + 1)));
          }
        }
      }
      
      if (!success) break;
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
      const cleanUrl = featuredUrl.replace("beta.presidenri.go.id", "presidenri.go.id");
      if (!images.includes(cleanUrl)) {
        images.push(cleanUrl);
      }
    } else {
      await this.getFeaturedMedia(post.featured_media, images);
    }
    
    if (images.length === 0) {
      this.getHtmlFallbackImages(post, images);
      if (images.length === 0) {
        this.getYoastFallbackImages(post, images);
      }
    }
    
    return images;
  }

  private async getMediaAttachments(postId: number, images: string[]): Promise<void> {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const mediaUrl = `https://presidenri.go.id/wp-json/wp/v2/media?parent=${postId}&per_page=100&page=${page}`;
      const mediaResponse = await this.network.fetch(mediaUrl, { verbose: this.options.verbose });
      
      if (mediaResponse.ok) {
        const mediaItems = await mediaResponse.json() as WordPressMedia[];
        for (const item of mediaItems) {
          const imageUrl = item.guid?.rendered;
          if (imageUrl) images.push(imageUrl.replace("beta.presidenri.go.id", "presidenri.go.id"));
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
    const featuredUrl = `https://presidenri.go.id/wp-json/wp/v2/media/${mediaId}`;
    const response = await this.network.fetch(featuredUrl, { verbose: this.options.verbose });
    if (response.ok) {
      const item = await response.json() as WordPressMedia;
      const imageUrl = item.guid?.rendered;
      if (imageUrl && !images.includes(imageUrl)) {
        images.push(imageUrl.replace("beta.presidenri.go.id", "presidenri.go.id"));
      }
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
        images.push(og.url.replace("beta.presidenri.go.id", "presidenri.go.id"));
      }
    }
  }
}
