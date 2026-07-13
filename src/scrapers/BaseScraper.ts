import pLimit from "p-limit";
import { DOWNLOAD_CONCURRENCY, FETCH_TIMEOUT, ITEM_PROCESSING_CONCURRENCY, DEFAULT_RETRIES, BACKPRESSURE_MULTIPLIER, PROGRESS_UPDATE_INTERVAL, BACKOFF_BASE_MS, BYTES_PER_MB } from "../config/constants";
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
  protected spinnerStarted = false;

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

    // Update spinner with current status
    this.logger.updateSpinner(this.formatStatus());
    this.spinnerStarted = true;
  }

  protected formatStatus(): string {
    const { page, found, pending, active, done, state, bytesDownloaded, bytesTotal, skipped } = this.stats;

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

    let activeStr = `${active} active`;
    if (active > 0 && bytesTotal && bytesTotal > 0) {
      const downloadedMb = (bytesDownloaded || 0) / BYTES_PER_MB;
      const totalMb = bytesTotal / BYTES_PER_MB;
      activeStr += ` (${downloadedMb.toFixed(1)}/${totalMb.toFixed(1)}MB)`;
    }

    let doneStr = `${done} done`;
    if (skipped > 0) {
      doneStr += ` (${skipped} skipped)`;
    }

    return `${prefix} | Downloads: ${pending} pending, ${activeStr}, ${doneStr}`;
  }

  protected matchesFilter(text: string): boolean {
    if (!this.options.filter) return true;
    return text.toLowerCase().includes(this.options.filter.toLowerCase());
  }

  protected async finishScrape(successMessage: string): Promise<void> {
    this.stats.state = "downloading";
    this.updateStats({});
    await this.waitForDownloads();
    this.logger.stopSpinner();
    this.logger.success(successMessage);
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
    const downloadStats = this.downloader.getStats();
    if (downloadStats.queued <= downloadStats.done + downloadStats.failed + downloadStats.skipped) {
      this.updateStats({});
      return;
    }

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.logger.warn(`\nTimeout waiting for downloads to complete (${FETCH_TIMEOUT / 1000}s elapsed).`);
        this.downloader.off("done", check);
        resolve();
      }, FETCH_TIMEOUT);

      const check = () => {
        const stats = this.downloader.getStats();
        if (stats.queued <= stats.done + stats.failed + stats.skipped) {
          clearTimeout(timeout);
          this.downloader.off("done", check);
          resolve();
        }
      };

      this.downloader.on("done", check);
      check();
    });
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
    let page = this.options.startPage ?? 1;
    let stopPagination = false;
    let consecutiveEmptyPages = 0;

    while (!stopPagination && !this.isShuttingDown && !this.downloader.getShuttingDown()) {
      this.updateStats({ page });

      const { result, stopped: retryFailed } = await this.fetchPageWithRetry(page, fetchPage);
      if (retryFailed) break;
      if (!result) break;

      if (result.items.length === 0) {
        consecutiveEmptyPages++;
        const stopAfterEmptyPages = this.options.stopAfterEmptyPages ?? 0;
        if (stopAfterEmptyPages > 0 && consecutiveEmptyPages >= stopAfterEmptyPages) break;
        if (!stopAfterEmptyPages) break;
        page++;
        continue;
      } else {
        consecutiveEmptyPages = 0;
      }

      if (result.total) this.stats.total = result.total;

      const { items: itemsToProcess, reachedEnd } = this.trimBySinceDate(result.items, options?.getItemDate);
      if (reachedEnd) stopPagination = true;

      const { savedCount, limitReached } = await this.processItemsWithConcurrency(itemsToProcess, processItem);
      this.stats.found += savedCount;
      if (limitReached) stopPagination = true;

      await this.checkBackpressure();

      if (this.options.startPage && !this.options.stopAfterEmptyPages && !this.options.all && page === (this.options.startPage || 1)) {
        stopPagination = true;
      }

      if (this.options.pageDelay && this.options.pageDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.options.pageDelay));
      }

      page++;
    }
  }

  private async fetchPageWithRetry<T>(
    page: number,
    fetchPage: (page: number) => Promise<{ items: T[]; total?: number } | null>
  ): Promise<{ result: { items: T[]; total?: number } | null; stopped: boolean }> {
    let retries = 0;
    while (retries <= DEFAULT_RETRIES) {
      try {
        return { result: await fetchPage(page), stopped: false };
      } catch (error) {
        retries++;
        if (retries > DEFAULT_RETRIES) {
          this.logger.error(`Failed to fetch page ${page} after ${DEFAULT_RETRIES} retries: ${error}`);
          return { result: null, stopped: true };
        }
        const delay = BACKOFF_BASE_MS * Math.pow(2, retries);
        this.logger.warn(`Error fetching page ${page}: ${error}. Retrying in ${delay / 1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    return { result: null, stopped: true };
  }

  private trimBySinceDate<T>(
    items: T[],
    getItemDate?: (item: T) => string | null
  ): { items: T[]; reachedEnd: boolean } {
    if (!getItemDate || !this.options.since) return { items, reachedEnd: false };

    const sinceDate = this.options.since;
    const boundaryIndex = items.findIndex(item => {
      const itemDate = getItemDate(item);
      return itemDate && itemDate < sinceDate;
    });
    if (boundaryIndex === -1) return { items, reachedEnd: false };
    return { items: items.slice(0, boundaryIndex), reachedEnd: true };
  }

  private async processItemsWithConcurrency<T>(
    items: T[],
    processItem: (item: T) => Promise<boolean>
  ): Promise<{ savedCount: number; limitReached: boolean }> {
    let savedCount = 0;
    let limitReached = false;

    const limit = pLimit(ITEM_PROCESSING_CONCURRENCY);
    const promises = items.map(item => limit(async () => {
      if (this.isShuttingDown || this.downloader.getShuttingDown() || limitReached) return;
      if (this.options.limit && this.stats.found + savedCount >= this.options.limit) {
        limitReached = true;
        return;
      }
      const saved = await processItem(item);
      if (saved) {
        savedCount++;
        if (savedCount % PROGRESS_UPDATE_INTERVAL === 0) this.updateStats({});
      }
    }));
    await Promise.all(promises);

    return { savedCount, limitReached };
  }

  protected async checkBackpressure(): Promise<void> {
    const maxPendingDownloads = DOWNLOAD_CONCURRENCY * BACKPRESSURE_MULTIPLIER;
    if (this.isShuttingDown || this.downloader.getShuttingDown()) return;

    const downloadStats = this.downloader.getStats();
    if (downloadStats.pending + downloadStats.active <= maxPendingDownloads) return;

    await new Promise<void>((resolve) => {
      const check = () => {
        if (this.isShuttingDown || this.downloader.getShuttingDown()) {
          this.downloader.off("done", check);
          resolve();
          return;
        }
        const stats = this.downloader.getStats();
        if (stats.pending + stats.active <= maxPendingDownloads) {
          this.downloader.off("done", check);
          resolve();
        }
      };
      this.downloader.on("done", check);
      this.updateStats({});
      check();
    });
  }

  abstract scrape(): Promise<void>;
}
