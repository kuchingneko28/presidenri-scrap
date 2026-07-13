import { describe, expect, test } from "bun:test";
import { BaseScraper } from "../src/scrapers/BaseScraper";
import { DatabaseService } from "../src/services/DatabaseService";
import { LoggerService } from "../src/services/LoggerService";
import { NetworkService } from "../src/services/NetworkService";
import { DownloadService } from "../src/services/DownloadService";
import type { ScraperOptions } from "../src/types";

// Concrete mock scraper to test BaseScraper.paginate
class MockScraper extends BaseScraper {
  constructor(options: ScraperOptions, db: DatabaseService, logger: LoggerService, network: NetworkService, downloader: DownloadService) {
    super(options, db, logger, network, downloader);
  }

  async scrape(): Promise<void> {
    // No-op for testing paginate directly
  }

  // Expose the protected paginate method for testing
  public async testPaginate<T>(
    fetchPage: (page: number) => Promise<{ items: T[]; total?: number } | null>,
    processItem: (item: T) => Promise<boolean>,
    options?: { getItemDate?: (item: T) => string | null }
  ): Promise<void> {
    return this.paginate(fetchPage, processItem, options);
  }
}

describe("BaseScraper - paginate", () => {
  const logger = new LoggerService();
  const network = new NetworkService(logger);
  const db = new DatabaseService(":memory:");
  const downloader = new DownloadService(logger, network);

  test("should page through items and process them", async () => {
    const scraper = new MockScraper({ startPage: 1, all: true }, db, logger, network, downloader);
    const fetchedPages: number[] = [];
    const processedItems: string[] = [];

    await scraper.testPaginate(
      async (page) => {
        fetchedPages.push(page);
        if (page === 1) {
          return { items: ["item1", "item2"] };
        }
        if (page === 2) {
          return { items: ["item3"] };
        }
        return null;
      },
      async (item) => {
        processedItems.push(item);
        return true;
      }
    );

    expect(fetchedPages).toEqual([1, 2, 3]);
    expect(processedItems).toEqual(["item1", "item2", "item3"]);
  });

  test("should stop early if item date is before since date", async () => {
    const scraper = new MockScraper(
      {
        startPage: 1,
        since: "2026-06-01",
      },
      db,
      logger,
      network,
      downloader
    );

    const processedItems: { id: number; date: string }[] = [];
    await scraper.testPaginate(
      async (page) => {
        if (page === 1) {
          return {
            items: [
              { id: 1, date: "2026-06-02" },
              { id: 2, date: "2026-05-30" }, // Older than since
              { id: 3, date: "2026-06-03" }, // Chronological boundary cut
            ],
          };
        }
        return null;
      },
      async (item) => {
        processedItems.push(item);
        return true;
      },
      {
        getItemDate: (item) => item.date,
      }
    );

    expect(processedItems.length).toBe(1);
    expect(processedItems[0]?.id).toBe(1);
  });
});
