import { BaseScraper } from "./BaseScraper";
import type { Article } from "../types";

export class SyncScraper extends BaseScraper {
  async scrape(): Promise<void> {
    const articles = this.db.getAllArticles();
    this.stats.total = articles.length;
    this.stats.state = "syncing";
    
    this.logger.startSpinner(`Syncing ${articles.length} articles...`);
    
    for (const article of articles) {
      if (this.isShuttingDown) break;
      if (this.options.limit && this.stats.found >= this.options.limit) break;
      
      if (!this.matchesFilter(article.title) && !this.matchesFilter(article.description)) {
        continue;
      }
      
      this.queueDownloads(article.title, article.date, article.images, article.link);
      
      this.stats.found++;
      if (this.stats.found % 50 === 0) {
        this.updateStats({});
        await new Promise(resolve => setTimeout(resolve, 0)); // Yield to event loop to let downloads start
      }
    }
    
    this.stats.state = "downloading";
    this.updateStats({});
    
    await this.waitForDownloads();
    this.logger.stopSpinner();
    this.logger.success(`Sync completed! Processed ${this.stats.found} articles.`);
  }
}
