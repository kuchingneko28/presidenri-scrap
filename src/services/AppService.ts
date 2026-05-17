import { DatabaseService } from "./DatabaseService";
import { LoggerService } from "./LoggerService";
import { NetworkService } from "./NetworkService";
import { DownloadService } from "./DownloadService";
import { BaseScraper } from "../scrapers/BaseScraper";
import { ApiScraper } from "../scrapers/ApiScraper";
import { LegacyScraper } from "../scrapers/LegacyScraper";
import { SyncScraper } from "../scrapers/SyncScraper";
import { BROWSER_REQUEST_FILE } from "../config/constants";
import type { ScraperOptions } from "../types";
import readline from "node:readline";

export class AppService {
  public db: DatabaseService;
  public logger: LoggerService;
  public network: NetworkService;
  public downloader: DownloadService;
  private currentScraper: BaseScraper | null = null;
  private isShuttingDown = false;

  constructor() {
    this.db = new DatabaseService();
    this.logger = new LoggerService();
    this.network = new NetworkService(this.logger);
    this.downloader = new DownloadService(this.logger, this.network);
    this.setupExitHandlers();
  }

  private setupExitHandlers(): void {
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
    };

    process.on("SIGINT", () => handleExit("SIGINT"));
    process.on("SIGTERM", () => handleExit("SIGTERM"));

    if (process.stdin.isTTY) {
      readline.emitKeypressEvents(process.stdin);
      process.stdin.setRawMode(true);
      process.stdin.on("keypress", (str, key) => {
        if (key.ctrl && key.name === "c") {
          handleExit("SIGINT");
        }
      });
    }
  }

  async runApiScraper(options: ScraperOptions): Promise<void> {
    this.currentScraper = new ApiScraper(
      options,
      this.db,
      this.logger,
      this.network,
      this.downloader
    );
    if (this.currentScraper) {
      await this.currentScraper.scrape();
    }
  }

  async runLegacyScraper(options: ScraperOptions): Promise<void> {
    this.currentScraper = new LegacyScraper(
      options,
      this.db,
      this.logger,
      this.network,
      this.downloader
    );
    if (this.currentScraper) {
      await this.currentScraper.scrape();
    }
  }

  async initRequestFile(): Promise<void> {
    const file = Bun.file(BROWSER_REQUEST_FILE);
    if (!(await file.exists())) {
      await Bun.write(
        BROWSER_REQUEST_FILE,
        `# Paste your curl command here\n# Make sure to use the "Copy as cURL" feature from your browser's developer tools`
      );
      this.logger.success(`Created ${BROWSER_REQUEST_FILE}`);
      this.logger.info(`Please paste your curl command into that file.`);
    } else {
      this.logger.info(`${BROWSER_REQUEST_FILE} already exists.`);
    }
  }

  async syncDownloads(options: ScraperOptions): Promise<void> {
    this.currentScraper = new SyncScraper(
      options,
      this.db,
      this.logger,
      this.network,
      this.downloader
    );
    if (this.currentScraper) {
      await this.currentScraper.scrape();
    }
  }

  showStats(): void {
    const count = this.db.getStats();
    this.logger.info(`Total articles in database: ${count}`);
  }

  public shutdown(): void {
    this.db.close();
    this.logger.stopSpinner();
  }
}
