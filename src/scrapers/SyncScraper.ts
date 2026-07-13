import { BaseScraper } from "./BaseScraper";
import { SYNC_BATCH_SIZE, SYNC_PROGRESS_INTERVAL } from "../config/constants";

export class SyncScraper extends BaseScraper {
  async scrape(): Promise<void> {
    const totalCount = this.db.getStats();
    this.stats.total = totalCount;
    this.stats.state = "syncing";
    this.logger.startSpinner(`Syncing ${totalCount} articles...`);
    this.logger.info(`Syncing ${totalCount} articles...`);
    
    let offset = 0;
    
    while (!this.isShuttingDown && !this.downloader.getShuttingDown()) {
      if (this.options.limit && this.stats.found >= this.options.limit) break;
      
      const articles = this.db.getArticlesPaged(SYNC_BATCH_SIZE, offset);
      if (articles.length === 0) break;
      
      for (const article of articles) {
        if (this.isShuttingDown || this.downloader.getShuttingDown()) break;
        if (this.options.limit && this.stats.found >= this.options.limit) break;
        
        if (!this.matchesFilter(article.title) && !this.matchesFilter(article.description)) {
          continue;
        }
        
        this.queueDownloads(article.title, article.date, article.images, article.link);
        
        this.stats.found++;
        if (this.stats.found % SYNC_PROGRESS_INTERVAL === 0) {
          this.updateStats({});
          await new Promise(resolve => setTimeout(resolve, 0)); // Yield to event loop to let downloads start
        }
      }
      
      await this.checkBackpressure();
      offset += SYNC_BATCH_SIZE;
    }
    
    await this.finishScrape(`Sync completed! Processed ${this.stats.found} articles.`);
  }
}
