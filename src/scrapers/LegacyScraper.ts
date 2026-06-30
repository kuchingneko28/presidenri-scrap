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
    this.stats.state = "scraping";
    this.logger.startSpinner("Starting Legacy Scrape...");

    await this.paginate<LegacyArticleMeta>(
      async (page) => {
        const url = page === 1 ? BASE_URL : `${BASE_URL}page/${page}/`;
        const response = await this.network.fetch(url, { verbose: this.options.verbose });
        if (!response.ok) {
          if (response.status === 404) return null;
          throw new Error(`Server returned ${response.status}`);
        }

        const html = await response.text();
        if (html.includes("Just a moment...")) {
          throw new Error("Cloudflare detected! Please update headers.");
        }

        const $ = cheerio.load(html);
        const articleNodes = $("article.media");

        const items: LegacyArticleMeta[] = [];
        articleNodes.each((_, articleElement) => {
          const link = $(articleElement).find(".title a").attr("href");
          const title = $(articleElement).find(".title a").text().trim();
          const dateText = $(articleElement).find(".datetime").text().replace(/\d+ Foto/, "").trim();
          if (link && title) items.push({ link, title, dateText });
        });

        return { items };
      },
      async (meta) => {
        if (!this.matchesFilter(meta.title)) {
          return false;
        }

        const cleanDate = parseDate(meta.dateText) || "";

        if (this.options.download) {
          const existing = this.db.getArticleByLink(meta.link);
          if (existing) {
            this.queueDownloads(existing.title, existing.date, existing.images, existing.link);
            return false;
          }
        } else {
          if (this.db.articleExistsByLink(meta.link)) {
            return false;
          }
        }

        const saved = await this.processArticle(meta.link, meta.title, cleanDate);
        if (saved && this.options.verbose) {
          this.logger.success(`Saved: ${meta.title}`);
        } else if (!saved && this.options.verbose) {
          this.logger.info(`Skipped: ${meta.title}`);
        }
        return saved;
      },
      {
        getItemDate: (meta) => parseDate(meta.dateText),
      }
    );

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
          this.queueDownloads(title, date, images, link);
        }
        return true;
      }
    } catch (error) {
      this.logger.error(`Failed to process article ${link}: ${error}`);
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
    } catch (error) {
      this.logger.warn(`Failed to extract category tag from link "${link}": ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
}
