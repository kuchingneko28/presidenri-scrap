import { mkdirSync, utimesSync, existsSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import pLimit from "p-limit";
import { DOWNLOADS_DIR, DOWNLOAD_CONCURRENCY, MIN_FILE_SIZE, DEFAULT_RETRIES, BACKOFF_BASE_MS } from "../config";
import { generateCandidateUrls, sanitizeFilename } from "../api/media";
import type { DownloadItem } from "../types";
import type { PresidenClient } from "../api/client";

export interface DownloaderStats {
  queued: number;
  active: number;
  downloaded: number;
  skipped: number;
  failed: number;
  bytes: number;
}

export class Downloader {
  private limit: ReturnType<typeof pLimit>;
  private downloadedSet = new Set<string>();
  private onProgressCb?: (stats: DownloaderStats) => void;
  private activePromises = new Set<Promise<void>>();

  private stats: DownloaderStats = {
    queued: 0,
    active: 0,
    downloaded: 0,
    skipped: 0,
    failed: 0,
    bytes: 0,
  };

  constructor(
    private client: PresidenClient,
    concurrency = DOWNLOAD_CONCURRENCY,
    private outputDir = DOWNLOADS_DIR
  ) {
    this.limit = pLimit(concurrency);
    mkdirSync(this.outputDir, { recursive: true });
  }

  onProgress(cb: (stats: DownloaderStats) => void): void {
    this.onProgressCb = cb;
  }

  getStats(): DownloaderStats {
    return { ...this.stats };
  }

  getTargetPath(item: DownloadItem): { folderName: string; filename: string; fullPath: string } {
    const cleanDate = item.date ? item.date.substring(0, 10) : "unknown-date";
    const folderName = `${cleanDate}_${sanitizeFilename(item.title)}`;
    const folderPath = path.join(this.outputDir, folderName);
    mkdirSync(folderPath, { recursive: true });

    let filename = path.basename(new URL(item.imageUrl).pathname);
    if (!filename || !filename.includes(".")) {
      filename = `image_${item.index + 1}.jpg`;
    }

    return {
      folderName,
      filename,
      fullPath: path.join(folderPath, filename),
    };
  }

  async download(item: DownloadItem, verbose = false, dryRun = false): Promise<void> {
    this.stats.queued++;
    this.onProgressCb?.(this.getStats());

    const task = this.limit(async () => {
      this.stats.active++;
      this.onProgressCb?.(this.getStats());

      try {
        const { filename, fullPath: filePath } = this.getTargetPath(item);

        if (existsSync(filePath)) {
          const stat = statSync(filePath);
          if (stat.size > MIN_FILE_SIZE) {
            this.stats.skipped++;
            this.onProgressCb?.(this.getStats());
            return;
          }
        }

        if (this.downloadedSet.has(item.imageUrl)) {
          this.stats.skipped++;
          this.onProgressCb?.(this.getStats());
          return;
        }

        if (dryRun) {
          if (verbose) console.log(`  [Dry-Run] ${filename}`);
          this.stats.downloaded++;
          this.onProgressCb?.(this.getStats());
          return;
        }

        const candidates = generateCandidateUrls(item.imageUrl);
        let success = false;

        for (const candidateUrl of candidates) {
          let attempts = 0;
          while (attempts <= DEFAULT_RETRIES && !success) {
            try {
              const res = await this.client.fetch(candidateUrl, {
                verbose: false,
                signal: AbortSignal.timeout(10_000),
              });

              if (!res.ok) {
                if (res.status === 404 || res.status === 403) break;
                attempts++;
                if (attempts <= DEFAULT_RETRIES) {
                  await new Promise((r) => setTimeout(r, BACKOFF_BASE_MS * attempts));
                  continue;
                }
                break;
              }

              const buffer = Buffer.from(await res.bytes());
              if (buffer.length < MIN_FILE_SIZE) break;

              await writeFile(filePath, buffer);

              if (item.date) {
                const timestamp = new Date(item.date).getTime() / 1000;
                if (!isNaN(timestamp)) {
                  try {
                    utimesSync(filePath, timestamp, timestamp);
                  } catch {}
                }
              }

              this.stats.downloaded++;
              this.stats.bytes += buffer.length;
              this.downloadedSet.add(item.imageUrl);
              this.onProgressCb?.(this.getStats());

              if (verbose) {
                const kb = (buffer.length / 1024).toFixed(0);
                console.log(`  [Downloaded] ${filename} (${kb} KB)`);
              }

              success = true;
              break;
            } catch {
              attempts++;
              if (attempts <= DEFAULT_RETRIES) {
                await new Promise((r) => setTimeout(r, BACKOFF_BASE_MS * attempts));
              }
            }
          }

          if (success) break;
        }

        if (!success) {
          this.stats.failed++;
          this.onProgressCb?.(this.getStats());
          if (verbose) console.warn(`  [Failed] ${filename}`);
        }
      } catch (error) {
        this.stats.failed++;
        this.onProgressCb?.(this.getStats());
        if (verbose) console.warn(`Download error:`, error);
      } finally {
        this.stats.active--;
        this.onProgressCb?.(this.getStats());
      }
    });

    const tracked = task.finally(() => this.activePromises.delete(tracked));
    this.activePromises.add(tracked);
    return task;
  }

  async waitForIdle(): Promise<void> {
    while (this.activePromises.size > 0) {
      await Promise.all(Array.from(this.activePromises));
    }
  }
}
