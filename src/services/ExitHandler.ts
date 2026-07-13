import type { LoggerService } from "./LoggerService";
import type { DownloadService } from "./DownloadService";
import type { NetworkService } from "./NetworkService";
import type { BaseScraper } from "../scrapers/BaseScraper";

export class ExitHandler {
  private isShuttingDown = false;
  private currentScraper: BaseScraper | null = null;
  private cleanupFn: (() => void) | null = null;

  constructor(
    private logger: LoggerService,
    private downloader: DownloadService,
    private network: NetworkService,
  ) {
    this.setup();
  }

  setCleanup(fn: () => void): void {
    this.cleanupFn = fn;
  }

  setScraper(scraper: BaseScraper): void {
    this.currentScraper = scraper;
  }

  private setup(): void {
    const handleExit = (signal: string) => {
      if (this.isShuttingDown) {
        this.logger.warn(`\nForce exiting...`);
        process.exit(1);
      }
      this.isShuttingDown = true;
      this.logger.warn(`\nReceived ${signal}. Graceful shutdown...`);
      if (this.currentScraper) {
        this.currentScraper.setShuttingDown(true);
      }
      this.downloader.setShuttingDown(true);
      this.network.setShuttingDown(true);
    };

    process.on("SIGINT", () => handleExit("SIGINT"));
    process.on("SIGTERM", () => handleExit("SIGTERM"));
    process.on("exit", () => {
      if (this.cleanupFn) {
        this.cleanupFn();
      }
      this.logger.flushSync();
    });
  }
}
