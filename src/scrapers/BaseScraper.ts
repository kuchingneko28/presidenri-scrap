import pLimit from "p-limit";
import { POLL_INTERVAL, DOWNLOAD_CONCURRENCY, DOWNLOAD_TIMEOUT, ITEM_PROCESSING_CONCURRENCY, DEFAULT_RETRIES } from "../config/constants";
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
    skipped: 0,
  };

  protected isShuttingDown = false;

  constructor(
    protected options: ScraperOptions,
    protected db: DatabaseService,
    protected logger: LoggerService,
    protected network: NetworkService,
    protected downloader: DownloadService
  ) {
    if (options.dryRun) {
      db.setDryRun(true);
      downloader.setDryRun(true);
    }
  }

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
      skipped: downloadStats.skipped,
    };
    
    this.logger.updateSpinner(this.formatStatus());
  }

  protected formatStatus(): string {
    const { page, found, queued, pending, active, done, total, state, bytesDownloaded, bytesTotal, skipped } = this.stats;
    
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
      bar = ` | ${this.logger.getProgressBar(done + skipped, queued)}`;
    } else if (total && total > 0) {
      bar = ` | ${this.logger.getProgressBar(found, total)}`;
    }

    let activeStr = `${active} active`;
    if (active > 0 && bytesTotal && bytesTotal > 0) {
      const downloadedMb = (bytesDownloaded || 0) / 1024 / 1024;
      const totalMb = bytesTotal / 1024 / 1024;
      activeStr += ` (${downloadedMb.toFixed(1)}/${totalMb.toFixed(1)}MB)`;
    }

    let doneStr = `${done} done`;
    if (skipped > 0) {
      doneStr += ` (${skipped} skipped)`;
    }

    return `${prefix} | Downloads: ${pending} pending, ${activeStr}, ${doneStr}${bar}`;
  }

  protected matchesFilter(text: string): boolean {
    if (!this.options.filter) return true;
    return text.toLowerCase().includes(this.options.filter.toLowerCase());
  }

  protected queueDownloads(title: string, date: string, images: string[], postUrl?: string): void {
    for (let imageIndex = 0; imageIndex < images.length; imageIndex++) {
      const imageUrl = images[imageIndex];
      if (imageUrl) {
        void this.downloader.download({ title, date, imageUrl, index: imageIndex, postUrl }, this.options.verbose);
      }
    }
  }

  protected async waitForDownloads(): Promise<void> {
    const startTime = Date.now();
    while (true) {
      const downloadStats = this.downloader.getStats();
      if (downloadStats.queued <= downloadStats.done + downloadStats.failed + downloadStats.skipped) break;

      if (Date.now() - startTime > DOWNLOAD_TIMEOUT) {
        this.logger.warn(`\nTimeout waiting for downloads to complete (${DOWNLOAD_TIMEOUT / 1000}s elapsed).`);
        break;
      }

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
    options?: {
      getItemDate?: (item: T) => string | null;
    }
  ): Promise<void> {
    let page = this.options.startPage || 1;
    let stopPagination = false;
    let stopImmediate = false;
    let consecutiveEmptyPages = 0;

    while (!stopPagination && !this.isShuttingDown && !this.downloader.getShuttingDown()) {
      this.updateStats({ page });

      let result: { items: T[]; total?: number } | null = null;
      let retries = 0;
      while (retries <= DEFAULT_RETRIES) {
        try {
          result = await fetchPage(page);
          break;
        } catch (error) {
          retries++;
          if (retries > DEFAULT_RETRIES) {
            this.logger.error(`Failed to fetch page ${page} after ${DEFAULT_RETRIES} retries: ${error}`);
            stopPagination = true;
            break;
          }
          const delay = Math.pow(2, retries) * 1000;
          this.logger.warn(`Error fetching page ${page}: ${error}. Retrying in ${delay / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      if (stopPagination || !result) break;

      if (result.items.length === 0) {
        consecutiveEmptyPages++;
        const stopAfterEmptyPages = this.options.stopAfterEmptyPages || 0;
        if (stopAfterEmptyPages > 0 && consecutiveEmptyPages >= stopAfterEmptyPages) {
          break;
        }
        if (!stopAfterEmptyPages) {
          break;
        }
        page++;
        continue;
      } else {
        consecutiveEmptyPages = 0;
      }

      if (result.total) this.stats.total = result.total;

      let itemsToProcess = result.items;
      if (options?.getItemDate && this.options.since) {
        const sinceDate = this.options.since;
        const boundaryIndex = itemsToProcess.findIndex(item => {
          const itemDate = options.getItemDate!(item);
          return itemDate && itemDate < sinceDate;
        });
        if (boundaryIndex !== -1) {
          itemsToProcess = itemsToProcess.slice(0, boundaryIndex);
          stopPagination = true;
        }
      }

      const limit = pLimit(ITEM_PROCESSING_CONCURRENCY);
      const promises = itemsToProcess.map(item => limit(async () => {
        if (this.isShuttingDown || this.downloader.getShuttingDown() || stopImmediate) return;
        if (this.options.limit && this.stats.found >= this.options.limit) {
          stopImmediate = true;
          stopPagination = true;
          return;
        }
        const saved = await processItem(item);
        if (saved) {
          this.stats.found++;
          if (this.stats.found % 10 === 0) this.updateStats({});
        }
      }));
      await Promise.all(promises);

      await this.checkBackpressure();

      if (this.options.startPage && !this.options.stopAfterEmptyPages && !this.options.all && page === (this.options.startPage || 1)) {
        stopPagination = true;
      }

      page++;
    }
  }

  protected async checkBackpressure(): Promise<void> {
    const maxPending = DOWNLOAD_CONCURRENCY * 3;
    while (true) {
      if (this.isShuttingDown || this.downloader.getShuttingDown()) break;
      const downloadStats = this.downloader.getStats();
      const currentQueueLength = downloadStats.pending + downloadStats.active;
      if (currentQueueLength <= maxPending) {
        break;
      }
      this.updateStats({});
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  abstract scrape(): Promise<void>;
}
