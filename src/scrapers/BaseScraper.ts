import pLimit from "p-limit";
import { POLL_INTERVAL, DOWNLOAD_CONCURRENCY } from "../config/constants";
import type { DatabaseService } from "../services/DatabaseService";
import type { LoggerService } from "../services/LoggerService";
import type { NetworkService } from "../services/NetworkService";
import type { DownloadService } from "../services/DownloadService";
import type { ScraperOptions, ScraperStats } from "../types";

export abstract class BaseScraper {
  protected stats: ScraperStats = {
    page: 1,
    found: 0,
    queued: 0,
    pending: 0,
    active: 0,
    done: 0,
    failed: 0,
    bytesDownloaded: 0,
    bytesTotal: 0,
    state: "idle",
  };

  protected isShuttingDown = false;

  constructor(
    protected options: ScraperOptions,
    protected db: DatabaseService,
    protected logger: LoggerService,
    protected network: NetworkService,
    protected downloader: DownloadService
  ) {}

  public setShuttingDown(value: boolean): void {
    this.isShuttingDown = value;
  }

  protected updateStats(updates: Partial<ScraperStats>): void {
    const downloadStats = this.downloader.getStats();
    this.stats = {
      ...this.stats,
      ...updates,
      queued: downloadStats.queued,
      pending: downloadStats.pending,
      active: downloadStats.active,
      done: downloadStats.done,
      failed: downloadStats.failed,
      bytesDownloaded: downloadStats.bytesDownloaded,
      bytesTotal: downloadStats.bytesTotal,
    };
    
    this.logger.updateSpinner(this.formatStatus());
  }

  protected formatStatus(): string {
    const { page, found, queued, pending, active, done, total, state, bytesDownloaded, bytesTotal } = this.stats;
    
    let prefix = "";
    switch (state) {
      case "scraping":
        prefix = `Scraping Page ${page} (Articles: ${found})`;
        break;
      case "syncing":
        prefix = `Syncing Database (Processed: ${found})`;
        break;
      case "downloading":
        prefix = `Scraping Complete | Downloading`;
        break;
      default:
        prefix = state.toUpperCase();
    }

    let bar = "";
    if (state === "downloading" && queued > 0) {
      bar = ` | ${this.logger.getProgressBar(done, queued)}`;
    } else if (total && total > 0) {
      bar = ` | ${this.logger.getProgressBar(found, total)}`;
    }

    let activeStr = `${active} active`;
    if (active > 0 && bytesTotal && bytesTotal > 0) {
      const downloadedMb = (bytesDownloaded || 0) / 1024 / 1024;
      const totalMb = bytesTotal / 1024 / 1024;
      activeStr += ` (${downloadedMb.toFixed(1)}/${totalMb.toFixed(1)}MB)`;
    }

    return `${prefix} | Downloads: ${pending} pending, ${activeStr}, ${done} done${bar}`;
  }

  protected matchesFilter(text: string): boolean {
    if (!this.options.filter) return true;
    return text.toLowerCase().includes(this.options.filter.toLowerCase());
  }

  protected queueDownloads(title: string, date: string, images: string[], postUrl?: string): void {
    for (let idx = 0; idx < images.length; idx++) {
      const imageUrl = images[idx];
      if (imageUrl) {
        this.downloader.download({ title, date, imageUrl, index: idx, postUrl }, this.options.verbose);
      }
    }
  }

  protected async waitForDownloads(): Promise<void> {
    while (true) {
      const s = this.downloader.getStats();
      if (s.queued <= s.done + s.failed) break;
      this.updateStats({});
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
    this.updateStats({});
  }

  /**
   * Pagination helper. Calls fetchPage(page) to get items; stops when null/empty returned.
   * Items are processed with bounded concurrency via processItem.
   * processItem should return true if the item was newly processed (counts toward stats.found).
   */
  protected async paginate<T>(
    fetchPage: (page: number) => Promise<{ items: T[]; total?: number } | null>,
    processItem: (item: T) => Promise<boolean>,
  ): Promise<void> {
    let page = this.options.startPage || 1;
    let stop = false;

    while (!stop && !this.isShuttingDown) {
      this.updateStats({ page });

      try {
        const result = await fetchPage(page);
        if (!result || result.items.length === 0) break;

        if (result.total) this.stats.total = result.total;

        const limit = pLimit(DOWNLOAD_CONCURRENCY);
        const promises = result.items.map(item => limit(async () => {
          if (this.isShuttingDown || stop) return;
          if (this.options.limit && this.stats.found >= this.options.limit) {
            stop = true;
            return;
          }
          const saved = await processItem(item);
          if (saved) {
            this.stats.found++;
            if (this.stats.found % 10 === 0) this.updateStats({});
          }
        }));
        await Promise.all(promises);
        page++;
      } catch (error) {
        this.logger.error(`Error on page ${page}: ${error}`);
        break;
      }
    }
  }

  abstract scrape(): Promise<void>;
}
