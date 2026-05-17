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
      const dlMb = (bytesDownloaded || 0) / 1024 / 1024;
      const totMb = bytesTotal / 1024 / 1024;
      activeStr += ` (${dlMb.toFixed(1)}/${totMb.toFixed(1)}MB)`;
    }

    return `${prefix} | Downloads: ${pending} pending, ${activeStr}, ${done} done${bar}`;
  }

  protected matchesFilter(text: string): boolean {
    if (!this.options.filter) return true;
    return text.toLowerCase().includes(this.options.filter.toLowerCase());
  }

  protected async waitForDownloads(): Promise<void> {
    while (this.downloader.getStats().queued > this.downloader.getStats().done + this.downloader.getStats().failed) {
      this.updateStats({});
      await new Promise(r => setTimeout(r, 200));
    }
    this.updateStats({});
  }

  abstract scrape(): Promise<void>;
}
