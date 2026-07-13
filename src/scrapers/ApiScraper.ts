import { BaseScraper } from "./BaseScraper";
import { API_BASE, getPostTypeLabel, DEFAULT_PER_PAGE, MEDIA_PER_PAGE, HTTP_BAD_REQUEST } from "../config/constants";
import { decodeHtmlEntities, addUnique } from "../utils";
import { MediaParser } from "../utils/MediaParser";
import { UrlGenerator } from "../utils/UrlGenerator";
import type { WordPressPost, WordPressMedia } from "../types/wordpress";

export class ApiScraper extends BaseScraper {
  async scrape(): Promise<void> {
    const perPage = this.options.perPage || DEFAULT_PER_PAGE;

    this.stats.state = "scraping";
    const postType = this.options.postType || "photo";
    const typeLabel = getPostTypeLabel(postType);
    this.logger.startSpinner(`Scraping ${typeLabel}...`);
    this.logger.info(`Starting API Scrape for ${typeLabel}...`);

    await this.paginate<WordPressPost>(
      async (page) => {
        let url = `${API_BASE}/${postType}?per_page=${perPage}&page=${page}&_embed`;
        if (this.options.before) {
          let beforeStr = String(this.options.before);
          if (beforeStr.length === 4) beforeStr += "-12-31";
          url += `&before=${beforeStr}T23:59:59`;
        }
        if (this.options.search) {
          url += `&search=${encodeURIComponent(this.options.search)}`;
        }

        const response = await this.network.fetch(url, { verbose: this.options.verbose });
        if (!response.ok) {
          if (response.status === HTTP_BAD_REQUEST) return null;
          throw new Error(`API returned ${response.status}`);
        }

        const total = response.headers.get("X-WP-Total");
        const posts = (await response.json()) as WordPressPost[];
        return { items: posts, total: total ? parseInt(total) : undefined };
      },
      async (post) => {
        const title = decodeHtmlEntities(post.title.rendered);
        const excerpt = decodeHtmlEntities(post.excerpt.rendered);
        if (!this.matchesFilter(title) && !this.matchesFilter(excerpt)) return false;

        const saved = await this.processPost(post);
        // Skip verbose per-article messages when progress bar is active
        if (saved && this.options.verbose && !this.spinnerStarted) {
          this.logger.success(`Saved: ${title}`);
        }
        return saved;
      },
      {
        getItemDate: (post) => post.date,
      }
    );

    await this.finishScrape(`API Scraping completed. Found ${this.stats.found} new articles.`);
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
    } catch (error) {
      this.logger.warn(`Failed to fetch media for post ${postId}: ${error instanceof Error ? error.message : String(error)}`);
    }

    const date = post.date.substring(0, 10);
    const description = decodeHtmlEntities(post.excerpt.rendered.replace(/<[^>]*>/g, "").trim());
    const title = decodeHtmlEntities(post.title.rendered);

    const postType = this.options.postType || "photo";
    const tag = getPostTypeLabel(postType, "tag");

    this.db.saveArticle({
      postId: postId,
      link: post.link,
      title,
      date,
      description,
      tags: [tag],
      images,
      modified: post.modified,
    });

    if (this.options.download) {
      this.queueDownloads(title, date, images, post.link);
    }

    return true;
  }

  private downloadExistingImages(postId: number): void {
    const article = this.db.getArticleByPostId(postId);
    if (article) {
      this.queueDownloads(article.title, article.date, article.images, article.link);
    }
  }

  private async extractImages(post: WordPressPost): Promise<string[]> {
    const images: string[] = [];
    const postId = post.id;
    const isVerbose = this.options.verbose;

    // Priority 1: Embedded featured media from _embed (free, no extra API call)
    this.extractEmbeddedMedia(post, images);
    if (isVerbose) this.logger.info(`[Post ${postId}] P1 embedded: ${images.length} image(s)`);

    // Priority 2: Fetch all media attachments (always, to get the full gallery)
    const countBefore = images.length;
    await this.getMediaAttachments(postId, images);
    const mediaAdded = images.length - countBefore;
    if (isVerbose) this.logger.info(`[Post ${postId}] P2 media API: +${mediaAdded} new (${images.length} total)`);

    // Priority 2b: If media API returned nothing, scrape the page for gallery images
    // The WordPress "photo" post type stores gallery images in the page HTML
    // (flexslider/data-fancybox) rather than as media attachments.
    if (images.length === countBefore && post.link) {
      if (isVerbose) this.logger.info(`[Post ${postId}] P2b: media API returned 0 new → trying HTML gallery fallback...`);
      await this.getPageGalleryFallback(post.link, images);
      const htmlAdded = images.length - countBefore;
      if (isVerbose) this.logger.info(`[Post ${postId}] P2b HTML gallery: +${htmlAdded} new (${images.length} total)`);
    }

    // Priority 3: Featured media via separate API call (only if nothing else worked)
    if (images.length === 0 && post.featured_media > 0) {
      if (isVerbose) this.logger.info(`[Post ${postId}] P3: trying featured media API...`);
      await this.getFeaturedMedia(post.featured_media, images);
      if (isVerbose) this.logger.info(`[Post ${postId}] P3 featured API: ${images.length} image(s)`);
    }

    // Priority 4: HTML content fallback
    if (images.length === 0) {
      if (isVerbose) this.logger.info(`[Post ${postId}] P4: trying HTML content / Yoast fallback...`);
      this.getHtmlFallbackImages(post, images);
      if (images.length === 0) this.getYoastFallbackImages(post, images);
      if (isVerbose) this.logger.info(`[Post ${postId}] P4 fallback: ${images.length} image(s)`);
    }

    if (isVerbose) this.logger.info(`[Post ${postId}] Final: ${images.length} image(s) total`);
    return images;
  }

  private extractEmbeddedMedia(post: WordPressPost, images: string[]): void {
    const embedded = post._embedded?.["wp:featuredmedia"]?.[0];
    if (!embedded?.source_url) return;

    addUnique(images, UrlGenerator.normalizeUrl(embedded.source_url));
  }

  private addMediaUrls(item: WordPressMedia, images: string[]): void {
    // source_url is the original full-res upload — DownloadService.fetchWithFallbacks()
    // already tries URL candidates (stripped -scaled, -NNNxNNN, path variations) via
    // UrlGenerator.generateCandidates(), so we only need one URL per media item.
    if (item.source_url) {
      addUnique(images, UrlGenerator.normalizeUrl(item.source_url));
    }
  }

  private async getMediaAttachments(postId: number, images: string[]): Promise<void> {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const mediaUrl = `${API_BASE}/media?parent=${postId}&per_page=${MEDIA_PER_PAGE}&page=${page}`;
      const mediaResponse = await this.network.fetch(mediaUrl, { verbose: this.options.verbose });
      
      if (mediaResponse.ok) {
        const mediaItems = await mediaResponse.json() as WordPressMedia[];
        if (this.options.verbose && page === 1) {
          this.logger.info(`[Post ${postId}] media?parent= returned ${mediaItems.length} item(s)`);
        }
        for (const item of mediaItems) {
          this.addMediaUrls(item, images);
        }
        if (mediaItems.length < MEDIA_PER_PAGE) hasMore = false;
        else page++;
      } else {
        if (this.options.verbose) {
          this.logger.info(`[Post ${postId}] media?parent= returned HTTP ${mediaResponse.status}`);
        }
        if (mediaResponse.status !== HTTP_BAD_REQUEST) {
          this.logger.warn(`Media API returned ${mediaResponse.status} for post ${postId}`);
        }
        hasMore = false;
      }
    }
  }

  private async getPageGalleryFallback(pageUrl: string, images: string[]): Promise<void> {
    if (this.options.verbose) {
      this.logger.info(`Scraping page gallery: ${pageUrl}`);
    }
    try {
      const response = await this.network.fetch(pageUrl, { verbose: this.options.verbose });
      if (!response.ok) {
        if (this.options.verbose) this.logger.info(`Page fetch failed: ${response.status}`);
        return;
      }
      const html = await response.text();
      const extracted = MediaParser.extractFromPageHtml(html, pageUrl);
      if (this.options.verbose) {
        this.logger.info(`Page gallery extracted ${extracted.length} URL(s) from HTML`);
      }
      for (const extractedUrl of extracted) {
        addUnique(images, UrlGenerator.normalizeUrl(extractedUrl));
      }
    } catch (error) {
      if (this.options.verbose) {
        this.logger.warn(`Failed to scrape page gallery: ${error instanceof Error ? error.message : String(error)}`);
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
    for (const extractedUrl of extracted) {
      addUnique(images, extractedUrl);
    }
  }

  private getYoastFallbackImages(post: WordPressPost, images: string[]): void {
    if (!post.yoast_head_json?.og_image) return;
    if (this.options.verbose) this.logger.info(`Still no images for post ${post.id}, checking Yoast SEO fallback...`);
    
    const ogImages = Array.isArray(post.yoast_head_json.og_image) 
      ? post.yoast_head_json.og_image 
      : [post.yoast_head_json.og_image];
    
    for (const ogImage of ogImages) {
      if (ogImage.url) {
        addUnique(images, UrlGenerator.normalizeUrl(ogImage.url));
      }
    }
  }
}
