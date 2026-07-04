import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { unlink, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { STORAGE_DIR, DOWNLOAD_DIR } from "../src/config/constants";
import { DatabaseService } from "../src/services/DatabaseService";
import { DownloadService } from "../src/services/DownloadService";
import { LoggerService } from "../src/services/LoggerService";
import { NetworkService } from "../src/services/NetworkService";
import type { DownloadItem } from "../src/types";

describe("Dry-Run Mode", () => {
  const testDbPath = path.join(STORAGE_DIR, "test-dryrun.db");
  let db: DatabaseService;
  let downloader: DownloadService;
  let network: NetworkService;
  let logger: LoggerService;

  beforeAll(() => {
    logger = new LoggerService();
    network = new NetworkService(logger);
    db = new DatabaseService(testDbPath);
    downloader = new DownloadService(logger, network);
  });

  afterAll(async () => {
    db.close();
    if (existsSync(testDbPath)) {
      await unlink(testDbPath);
    }
  });

  test("DatabaseService does not write when dryRun is true", () => {
    db.setDryRun(true);
    db.saveArticle({
      link: "https://example.com/dryrun-test-article",
      title: "Dry Run Test",
      date: "2026-07-01",
      description: "Should not be saved",
      tags: [],
      images: [],
    });

    const exists = db.articleExistsByLink("https://example.com/dryrun-test-article");
    expect(exists).toBe(false);
  });

  test("DownloadService does not write folders or files when dryRun is true", async () => {
    downloader.setDryRun(true);
    const item: DownloadItem = {
      title: "Dry Run Download Test",
      date: "2026-07-01",
      imageUrl: "https://example.com/image-dryrun.jpg",
      index: 0,
    };

    const targetDir = path.join(DOWNLOAD_DIR, "2026-07-01 - Dry Run Download Test");
    expect(existsSync(targetDir)).toBe(false);

    await downloader.download(item, false);

    expect(existsSync(targetDir)).toBe(false);
    expect(downloader.getStats().done).toBe(1);
  });
});
