import pLimit from "p-limit";
import { BaseScraper } from "./BaseScraper";
import { DEFAULT_SINCE } from "../config/constants";
import { decodeHtmlEntities } from "../utils";
import { MediaParser } from "../utils/MediaParser";
import type { WordPressPost } from "../types/wordpress";
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
      let url = `https://presidenri.go.id/wp-json/wp/v2/photo?per_page=${perPage}&page=${page}`;
      if (this.options.before) {
        url += `&before=${this.options.before}T23:59:59`;
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
            if (this.options.since && post.date < this.options.since) return;

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
            this.logger.warn(`Retry ${i + 1}/${retries} for page ${page}...`);
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
        // If we are in download mode, we still want to ensure images are downloaded
        // even if the metadata is already in the DB.
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
      return false;
    }

    const images: string[] = [];

    // Fetch media attachments (handle pagination because WP defaults to 10 per page)
    try {
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const mediaUrl = `https://presidenri.go.id/wp-json/wp/v2/media?parent=${postId}&per_page=100&page=${page}`;
        const mediaResponse = await this.network.fetch(mediaUrl, { verbose: this.options.verbose });
        
        if (mediaResponse.ok) {
          const mediaItems = await mediaResponse.json() as any[];
          for (const item of mediaItems) {
            const imageUrl = item.guid?.rendered;
            if (imageUrl) {
              images.push(imageUrl.replace("beta.presidenri.go.id", "presidenri.go.id"));
            }
          }
          if (mediaItems.length < 100) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false; // Stop on 400 Bad Request or end of pages
        }
      }

      // Check Featured Media
      if (post.featured_media > 0) {
        const featuredUrl = `https://presidenri.go.id/wp-json/wp/v2/media/${post.featured_media}`;
        const featuredResponse = await this.network.fetch(featuredUrl, { verbose: this.options.verbose });
        if (featuredResponse.ok) {
          const item = await featuredResponse.json() as any;
          const imageUrl = item.guid?.rendered;
          if (imageUrl && !images.includes(imageUrl)) {
            images.push(imageUrl.replace("beta.presidenri.go.id", "presidenri.go.id"));
          }
        }
      }

      // Fallback 1: Parse content.rendered for <img> tags
      if (post.content?.rendered) {
        if (this.options.verbose && images.length === 0) {
          this.logger.info(`Primary media empty for post ${postId}, checking HTML content fallback...`);
        }
        const extracted = MediaParser.extractFromHtml(post.content.rendered);
        extracted.forEach(img => {
          if (!images.includes(img)) images.push(img);
        });
      }

      // Fallback 2: Check Yoast SEO og_image
      if (post.yoast_head_json?.og_image) {
        if (this.options.verbose && images.length === 0) {
          this.logger.info(`Still no images for post ${postId}, checking Yoast SEO fallback...`);
        }
        const ogImages = Array.isArray(post.yoast_head_json.og_image) 
          ? post.yoast_head_json.og_image 
          : [post.yoast_head_json.og_image];
        
        for (const og of ogImages) {
          if (og.url && !images.includes(og.url)) {
            images.push(og.url.replace("beta.presidenri.go.id", "presidenri.go.id"));
          }
        }
      }
    } catch (e) {
      if (this.options.verbose) {
        this.logger.warn(`Failed to fetch media for post ${postId}: ${e}`);
      }
    }

    const date = post.date.substring(0, 10);
    const description = decodeHtmlEntities(post.excerpt.rendered.replace(/<[^>]*>/g, "").trim());

    this.db.saveArticle({
      post_id: postId,
      link: post.link,
      title: decodeHtmlEntities(post.title.rendered),
      date,
      description,
      tags: ["Foto"],
      images,
      modified: post.modified,
    });

    if (this.options.download) {
      images.forEach((img, idx) => {
        this.downloader.download({
          title: decodeHtmlEntities(post.title.rendered),
          date,
          imageUrl: img,
          index: idx,
          postUrl: post.link,
        }, this.options.verbose);
      });
    }

    return true;
  }
}
