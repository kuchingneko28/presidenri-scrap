import { mkdirSync, utimesSync, statSync, linkSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import pLimit from "p-limit";
import { DOWNLOAD_DIR, DOWNLOAD_CONCURRENCY, DEFAULT_RETRIES, STREAM_TIMEOUT, FETCH_TIMEOUT, MIN_FILE_SIZE, FALLBACK_FILENAME_PREFIX, FALLBACK_EXTENSION } from "../config/constants";
import type { DownloadItem, DownloadStats } from "../types";
import { sanitize } from "../utils";
import { UrlGenerator } from "../utils/UrlGenerator";
import type { LoggerService } from "./LoggerService";
import type { NetworkService } from "./NetworkService";
import { CloudflareBlockError } from "./NetworkService";

export class DownloadService extends EventEmitter {
  private limit!: ReturnType<typeof pLimit>;
  private downloadedUrls = new Map<string, string>();
  private stats = {
    queued: 0,
    active: 0,
    done: 0,
    failed: 0,
    bytesDownloaded: 0,
    bytesTotal: 0,
    skipped: 0,
  };

  constructor(
    private logger: LoggerService,
    private network: NetworkService,
    concurrency: number = DOWNLOAD_CONCURRENCY
  ) {
    super();
    this.limit = pLimit(concurrency);
  }

  private isShuttingDown = false;
  private dryRun = false;

  public setDryRun(value: boolean): void {
    this.dryRun = value;
  }

  reset(): void {
    this.stats = { queued: 0, active: 0, done: 0, failed: 0, bytesDownloaded: 0, bytesTotal: 0, skipped: 0 };
  }

  public setShuttingDown(value: boolean): void {
    if (value && !this.isShuttingDown) {
      this.logger.warn("Shutdown requested. Skipping remaining downloads...");
    }
    this.isShuttingDown = value;
  }

  async download(item: DownloadItem, verbose = false): Promise<void> {
    this.stats.queued++;
    const normalizedUrl = UrlGenerator.normalizeUrl(item.imageUrl);

    const existingPath = this.downloadedUrls.get(normalizedUrl);
    if (existingPath) {
      const newFilePath = this.getFilePath(item);
      if (this.dryRun) {
        if (verbose) this.logger.info(`[Dry-Run] Would link: ${existingPath} -> ${newFilePath}`);
        this.stats.skipped++;
        return;
      }
      if (!this.checkFileExists(newFilePath)) {
        try {
          linkSync(existingPath, newFilePath);
          this.stats.skipped++;
          return;
        } catch {
          // File not ready yet — fall through to download
        }
      } else {
        this.stats.skipped++;
        return;
      }
    }

    return this.limit(async () => {
      if (this.isShuttingDown) {
        this.stats.skipped++;
        return;
      }
      this.stats.active++;
      try {
        const filePath = this.getFilePath(item);
        if (this.checkFileExists(filePath)) return;

        if (this.dryRun) {
          if (verbose) this.logger.info(`[Dry-Run] Would download: ${item.imageUrl} -> ${filePath}`);
          this.stats.done++;
          return;
        }

        const { response, buffer, contentLength, receivedLength } = await this.fetchWithFallbacks(item, verbose);
        await this.saveFile(filePath, buffer, response, item);

        this.downloadedUrls.set(normalizedUrl, filePath);

        this.stats.bytesDownloaded += receivedLength;
        this.stats.bytesTotal += Math.max(contentLength, receivedLength);

        this.stats.done++;
      } catch (error) {
        this.stats.failed++;
        this.logger.error(`Download failed: ${item.imageUrl} - ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        this.stats.active--;
        this.emit("done");
      }
    });
  }

  private getFilePath(item: DownloadItem): string {
    const folderName = `${item.date} - ${sanitize(item.title)}`;
    const folderPath = path.join(DOWNLOAD_DIR, folderName);
    if (!this.dryRun) {
      mkdirSync(folderPath, { recursive: true });
    }

    const urlPath = item.imageUrl.split("?")[0] || "";
    const originalFileName = path.basename(urlPath);
    const fileName = originalFileName.includes(".") ? originalFileName : `${FALLBACK_FILENAME_PREFIX}${item.index}${FALLBACK_EXTENSION}`;
    return path.join(folderPath, fileName);
  }

  private checkFileExists(filePath: string): boolean {
    try {
      statSync(filePath);
      this.stats.done++;
      return true;
    } catch {
      return false;
    }
  }

  private async fetchWithFallbacks(item: DownloadItem, verbose: boolean): Promise<{
    response: Response;
    buffer: Uint8Array;
    contentLength: number;
    receivedLength: number;
  }> {
    const uniqueUrls = UrlGenerator.generateCandidates(item.imageUrl);
    let lastError: Error | null = null;

    for (const url of uniqueUrls) {
      try {
        const response = await this.network.fetch(url, { verbose, timeout: FETCH_TIMEOUT }, DEFAULT_RETRIES);
        this.validateResponse(response);

        const contentLength = parseInt(response.headers.get("Content-Length") || "0", 10);
        let receivedLength = 0;
        let receivedChunks: Uint8Array[] = [];

        if (response.body) {
          const result = await this.readStream(response.body);
          receivedLength = result.length;
          receivedChunks = result.data;
        } else {
          const ab = await response.arrayBuffer();
          receivedLength = ab.byteLength;
          receivedChunks = [new Uint8Array(ab)];
        }

        const buffer = this.concatChunks(receivedChunks, receivedLength);
        if (buffer.byteLength < MIN_FILE_SIZE) throw new Error("File too small");

        return { response, buffer, contentLength, receivedLength };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.checkCloudflareBlock(lastError);
      }
    }

    const attemptMsg = uniqueUrls.length > 1 ? `after trying ${uniqueUrls.length} URL variations` : "URL";
    throw new Error(`Failed ${attemptMsg}. Last error: ${lastError?.message || "Unknown"}`);
  }

  private validateResponse(response: Response): void {
    const contentType = response.headers.get("Content-Type") || "";
    if (!response.ok || (!contentType.startsWith("image/") && response.status !== 404)) {
      throw new Error(`Invalid response (${response.status})`);
    }
  }

  private async readStream(body: ReadableStream<Uint8Array>): Promise<{ length: number; data: Uint8Array[] }> {
    let receivedLength = 0;
    const chunks: Uint8Array[] = [];
    const reader = body.getReader();

    let timeoutErr: Error | null = null;
    let timeoutId: NodeJS.Timeout | null = null;
    let absoluteTimeoutId: NodeJS.Timeout | null = null;

    const resetTimeout = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        timeoutErr = new Error("Stream read timeout (tarpit detected)");
        reader.cancel().catch(() => {});
      }, STREAM_TIMEOUT);
    };

    resetTimeout();

    absoluteTimeoutId = setTimeout(() => {
      timeoutErr = new Error("Absolute stream download timeout exceeded");
      reader.cancel().catch(() => {});
    }, FETCH_TIMEOUT);

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          receivedLength += value.length;
          resetTimeout();
        }
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      if (absoluteTimeoutId) clearTimeout(absoluteTimeoutId);
    }

    if (timeoutErr) {
      throw timeoutErr;
    }

    return { length: receivedLength, data: chunks };
  }

  private concatChunks(chunks: Uint8Array[], length: number): Uint8Array {
    const buffer = new Uint8Array(length);
    let position = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, position);
      position += chunk.length;
    }
    return buffer;
  }

  public getShuttingDown(): boolean {
    return this.isShuttingDown;
  }

  private checkCloudflareBlock(error: Error): void {
    if (error instanceof CloudflareBlockError) {
      if (!this.isShuttingDown) {
        this.isShuttingDown = true;
        this.network.setShuttingDown(true);
        this.logger.error(`\nCRITICAL: Cloudflare block detected during download. Aborting!`);
      }
      throw error;
    }
  }

  private async saveFile(filePath: string, buffer: Uint8Array, response: Response, item: DownloadItem): Promise<void> {
    await writeFile(filePath, buffer);
    const lastModified = response.headers.get("Last-Modified");
    const mtime = lastModified ? new Date(lastModified) : new Date(item.date);
    if (!isNaN(mtime.getTime())) {
      utimesSync(filePath, mtime, mtime);
    }
  }

  async waitForIdle(): Promise<void> {
    if (this.stats.queued <= this.stats.done + this.stats.failed + this.stats.skipped) {
      return;
    }

    return new Promise((resolve) => {
      const check = () => {
        if (this.stats.queued <= this.stats.done + this.stats.failed + this.stats.skipped) {
          this.off("done", check);
          resolve();
        }
      };
      this.on("done", check);
      check();
    });
  }

  getStats(): DownloadStats {
    return {
      ...this.stats,
      pending: this.limit.pendingCount,
    };
  }
}
