import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { BaseScraper } from "./BaseScraper";
import { BASE_URL, DOWNLOAD_CONCURRENCY } from "../config/constants";
import { parseDate } from "../utils";
import { MediaParser } from "../utils/MediaParser";

interface LegacyArticleMeta {
  link: string;
  title: string;
  dateText: string;
}

export class LegacyScraper extends BaseScraper {
  async scrape(): Promise<void> {
    const startPage = this.options.startPage || 1;
    const stopAfterEmptyPages = this.options.stopAfterEmptyPages || 0;
    let page = startPage;
    let consecutiveEmptyPages = 0;
    let stopScraper = false;

    this.stats.state = "scraping";
    this.logger.startSpinner("Starting Legacy Scrape...");

    while (!stopScraper && !this.isShuttingDown) {
      this.updateStats({ page });
      const url = page === 1 ? BASE_URL : `${BASE_URL}page/${page}/`;
      
      try {
        const response = await this.network.fetch(url, { verbose: this.options.verbose });
        if (!response.ok) {
          if (response.status === 404) break;
          throw new Error(`Server returned ${response.status}`);
        }

        const html = await response.text();
        if (html.includes("Just a moment...")) {
          throw new Error("Cloudflare detected! Please update headers.");
        }

        const $ = cheerio.load(html);
        const articleNodes = $("article.media");

        if (articleNodes.length === 0) {
          consecutiveEmptyPages++;
          if (stopAfterEmptyPages > 0 && consecutiveEmptyPages >= stopAfterEmptyPages) {
            break;
          }
          if (page > startPage) break; // End of list
        } else {
          consecutiveEmptyPages = 0;
        }

        const potentialArticles: LegacyArticleMeta[] = [];
        articleNodes.each((_, el) => {
          const link = $(el).find(".title a").attr("href");
          const title = $(el).find(".title a").text().trim();
          const dateText = $(el).find(".datetime").text().replace(/\d+ Foto/, "").trim();
          if (link && title) potentialArticles.push({ link, title, dateText });
        });

        const limit = pLimit(DOWNLOAD_CONCURRENCY);
        const pagePromises = potentialArticles.map(meta => limit(async () => {
          if (this.isShuttingDown) return;
          if (this.options.limit && this.stats.found >= this.options.limit) {
            stopScraper = true;
            return;
          }

          const cleanDate = parseDate(meta.dateText);
          if (cleanDate && this.options.since) {
            if (cleanDate < this.options.since) {
              stopScraper = true;
              return;
            }
          }

          if (!this.matchesFilter(meta.title)) {
            return;
          }

          if (this.options.download) {
            const existing = this.db.getArticleByLink(meta.link);
            if (existing) {
              existing.images.forEach((img, idx) => {
                this.downloader.download({
                  title: existing.title,
                  date: existing.date,
                  imageUrl: img,
                  index: idx,
                  postUrl: existing.link,
                }, this.options.verbose);
              });
              return;
            }
          } else {
            if (this.db.articleExistsByLink(meta.link)) {
              return;
            }
          }

          const saved = await this.processArticle(meta.link, meta.title, cleanDate || "");
          if (saved) {
            this.stats.found++;
            if (this.options.verbose) {
              this.logger.success(`Saved: ${meta.title}`);
            }
            if (this.stats.found % 10 === 0) {
              this.updateStats({});
            }
          } else if (this.options.verbose) {
             this.logger.info(`Skipped: ${meta.title}`);
          }
        }));

        await Promise.all(pagePromises);
        
        if (this.options.startPage && !this.options.stopAfterEmptyPages && page === startPage) {
            // If only one page was requested (default behavior if no --all/--update)
            break;
        }

        page++;
      } catch (error) {
        this.logger.error(`Error on page ${page}: ${error}`);
        break;
      }
    }

    this.stats.state = "downloading";
    this.updateStats({});

    if (this.options.download) {
      await this.waitForDownloads();
    }

    this.logger.stopSpinner();
    this.logger.success(`Legacy Scraping completed. Found ${this.stats.found} new articles.`);
  }

  private async processArticle(link: string, title: string, date: string): Promise<boolean> {
    try {
      const response = await this.network.fetch(link, { verbose: this.options.verbose });
      if (!response.ok) return false;

      const html = await response.text();
      const $ = cheerio.load(html);

      let description = $(".excerpt").first().text().trim();
      if (!description) {
        description = $('meta[name="description"]').attr("content") || "";
      }

      const images = this.extractImageUrls($, link);

      if (images.length > 0) {
        this.db.saveArticle({
          link,
          title,
          date,
          description,
          tags: this.extractCategoryTag(link),
          images,
        });

        if (this.options.download) {
          images.forEach((img, idx) => {
            this.downloader.download({
              title,
              date,
              imageUrl: img,
              index: idx,
              postUrl: link,
            }, this.options.verbose);
          });
        }
        return true;
      }
    } catch (e) {
      this.logger.error(`Failed to process article ${link}: ${e}`);
    }
    return false;
  }

  private extractImageUrls($: cheerio.CheerioAPI, articleUrl: string): string[] {
    return MediaParser.extractFromSlider($, articleUrl);
  }

  private extractCategoryTag(link: string): string[] {
    try {
      const urlObj = new URL(link);
      const category = urlObj.pathname.split("/").filter(Boolean)[0];
      if (!category) return [];
      return [category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, " ")];
    } catch {
      return [];
    }
  }
}
