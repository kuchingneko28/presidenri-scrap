import { DatabaseService } from "./DatabaseService";
import { LoggerService } from "./LoggerService";
import { NetworkService } from "./NetworkService";
import { DownloadService } from "./DownloadService";
import { ExitHandler } from "./ExitHandler";
import { SearchService } from "./SearchService";
import { ApiScraper } from "../scrapers/ApiScraper";
import { LegacyScraper } from "../scrapers/LegacyScraper";
import { SyncScraper } from "../scrapers/SyncScraper";
import { BROWSER_REQUEST_FILE, DOWNLOAD_DIR, IMAGE_FILE_EXTENSION_PATTERN } from "../config/constants";
import type { ScraperOptions, SearchOptions } from "../types";
import { existsSync, readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";

export class AppService {
  private db: DatabaseService;
  private logger: LoggerService;
  private network: NetworkService;
  private downloader: DownloadService;
  private exitHandler: ExitHandler;
  private searchService: SearchService;

  constructor() {
    this.db = new DatabaseService();
    this.logger = new LoggerService();
    this.network = new NetworkService(this.logger);
    this.downloader = new DownloadService(this.logger, this.network);
    this.exitHandler = new ExitHandler(this.logger, this.downloader, this.network);
    this.searchService = new SearchService(this.db, this.logger);
    this.exitHandler.setCleanup(() => this.db.close());
  }

  async runApiScraper(options: ScraperOptions): Promise<void> {
    const scraper = new ApiScraper(options, this.db, this.logger, this.network, this.downloader);
    this.exitHandler.setScraper(scraper);
    await scraper.scrape();
  }

  async runLegacyScraper(options: ScraperOptions): Promise<void> {
    const scraper = new LegacyScraper(options, this.db, this.logger, this.network, this.downloader);
    this.exitHandler.setScraper(scraper);
    await scraper.scrape();
  }

  async initRequestFile(): Promise<void> {
    if (!existsSync(BROWSER_REQUEST_FILE)) {
      await writeFile(
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
    const scraper = new SyncScraper(options, this.db, this.logger, this.network, this.downloader);
    this.exitHandler.setScraper(scraper);
    await scraper.scrape();
  }

  searchArticles(queryText: string, options: SearchOptions): void {
    this.searchService.search(queryText, options);
  }

  showStats(): void {
    const totalArticles = this.db.getStats();
    const { totalImages, articlesWithImages } = this.db.getImageStats();
    this.logger.info(`Total articles in database: ${totalArticles}`);
    this.logger.info(`Articles with images: ${articlesWithImages}`);
    this.logger.info(`Total images in database: ${totalImages}`);

    if (existsSync(DOWNLOAD_DIR)) {
      let filesOnDisk = 0;
      for (const entry of readdirSync(DOWNLOAD_DIR, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const folderPath = `${DOWNLOAD_DIR}/${entry.name}`;
          for (const file of readdirSync(folderPath)) {
            if (IMAGE_FILE_EXTENSION_PATTERN.test(file)) filesOnDisk++;
          }
        }
      }
      this.logger.info(`Images downloaded on disk: ${filesOnDisk}`);
      if (totalImages > 0) {
        const pct = Math.round((filesOnDisk / totalImages) * 100);
        this.logger.info(`Download completeness: ${pct}%`);
      }
    }
  }

  public shutdown(): void {
    this.logger.stopSpinner();
  }

  public async runAndExit(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : String(error));
      this.shutdown();
      process.exit(1);
    }
    this.shutdown();
    process.exit(0);
  }
}
