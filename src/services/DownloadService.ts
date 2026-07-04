import { mkdirSync, utimesSync, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import pLimit from 'p-limit';
import { DOWNLOAD_DIR, DOWNLOAD_CONCURRENCY, STREAM_TIMEOUT, FETCH_TIMEOUT, MIN_FILE_SIZE } from '../config/constants';
import type { DownloadItem, DownloadStats } from '../types';
import { sanitize } from '../utils';
import { UrlGenerator } from '../utils/UrlGenerator';
import type { LoggerService } from './LoggerService';
import type { NetworkService } from './NetworkService';
import { CloudflareBlockError } from './NetworkService';

export class DownloadService {
  private limit!: ReturnType<typeof pLimit>;
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
    this.limit = pLimit(concurrency);
  }

  private isShuttingDown = false;
  private dryRun = false;

  public setDryRun(value: boolean): void {
    this.dryRun = value;
  }

  public setShuttingDown(value: boolean): void {
    if (value && !this.isShuttingDown) {
      this.logger.warn("Shutdown requested. Skipping remaining downloads...");
    }
    this.isShuttingDown = value;
  }

  async download(item: DownloadItem, verbose = false): Promise<void> {
    this.stats.queued++;

    return this.limit(async () => {
      if (this.isShuttingDown) {
        this.stats.skipped++; // Prevent waitForDownloads hanging forever
        return;
      }
      this.stats.active++;
      try {
        const filePath = this.getFilePath(item);
        if (await this.checkFileExists(filePath, verbose, item)) return;

        if (this.dryRun) {
          if (verbose) this.logger.info(`[Dry-Run] Would download: ${item.imageUrl} -> ${filePath}`);
          this.stats.done++;
          return;
        }

        const { response, buffer, contentLength, receivedLength } = await this.fetchWithFallbacks(item, verbose);
        await this.saveFile(filePath, buffer, response, item);

        // Count bytes only on success — no rollback needed
        this.stats.bytesDownloaded += receivedLength;
        this.stats.bytesTotal += Math.max(contentLength, receivedLength);

        if (verbose) this.logger.success(`Downloaded: ${path.basename(filePath)}`);
        this.stats.done++;
      } catch (error) {
        this.stats.failed++;
        this.logger.error(`Download failed: ${item.imageUrl} - ${error}`);
      } finally {
        this.stats.active--;
      }
    });
  }

  private getFilePath(item: DownloadItem): string {
    const folderName = `${item.date} - ${sanitize(item.title)}`;
    const folderPath = path.join(DOWNLOAD_DIR, folderName);
    if (!this.dryRun) {
      mkdirSync(folderPath, { recursive: true });
    }

    const urlPath = item.imageUrl.split('?')[0] || '';
    const originalFileName = path.basename(urlPath);
    const fileName = originalFileName.includes('.') ? originalFileName : `image_${item.index}.jpg`;
    return path.join(folderPath, fileName);
  }

  private async checkFileExists(filePath: string, verbose: boolean, item: DownloadItem): Promise<boolean> {
    if (existsSync(filePath)) {
      if (verbose) this.logger.info(`Skipping existing: ${path.basename(filePath)}`);
      this.stats.done++;
      return true;
    }
    return false;
  }

  private async fetchWithFallbacks(item: DownloadItem, verbose: boolean): Promise<{
    response: Response;
    buffer: Uint8Array;
    contentLength: number;
    receivedLength: number;
  }> {
    const uniqueUrls = UrlGenerator.generateCandidates(item.imageUrl);
    let lastError: Error | undefined;

    for (const url of uniqueUrls) {
      try {
        if (verbose && url !== item.imageUrl) this.logger.info(`Trying fallback: ${url}`);

        const response = await this.network.fetch(url, { verbose, timeout: FETCH_TIMEOUT }, 1);
        this.validateResponse(response);

        const contentLength = parseInt(response.headers.get('Content-Length') || '0', 10);
        let receivedLength = 0;
        let chunks: Uint8Array[] = [];

        if (response.body) {
          const result = await this.readStream(response.body);
          receivedLength = result.length;
          chunks = result.data;
        } else {
          const ab = await response.arrayBuffer();
          receivedLength = ab.byteLength;
          chunks = [new Uint8Array(ab)];
        }

        const buffer = this.concatChunks(chunks, receivedLength);
        if (buffer.byteLength < MIN_FILE_SIZE) throw new Error('File too small');

        return { response, buffer, contentLength, receivedLength };
      } catch (error) {
        lastError = error as Error;
        if (verbose) this.logger.warn(`Fetch failed for ${url}: ${lastError.message}`);
        this.checkCloudflareBlock(lastError);
      }
    }

    const attemptMsg = uniqueUrls.length > 1 ? `after trying ${uniqueUrls.length} URL variations` : 'URL';
    throw new Error(`Failed ${attemptMsg}. Last error: ${lastError?.message || 'Unknown'}`);
  }

  private validateResponse(response: Response): void {
    const contentType = response.headers.get('Content-Type') || '';
    if (!response.ok || (!contentType.startsWith('image/') && response.status !== 404)) {
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
        timeoutErr = new Error('Stream read timeout (tarpit detected)');
        reader.cancel().catch(() => {});
      }, STREAM_TIMEOUT);
    };

    resetTimeout();

    absoluteTimeoutId = setTimeout(() => {
      timeoutErr = new Error('Absolute stream download timeout exceeded');
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
    const lastModified = response.headers.get('Last-Modified');
    const mtime = lastModified ? new Date(lastModified) : new Date(item.date);
    if (!isNaN(mtime.getTime())) {
      utimesSync(filePath, mtime, mtime);
    }
  }

  async waitForIdle(): Promise<void> {
    while (this.stats.queued > this.stats.done + this.stats.failed + this.stats.skipped) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  getStats(): DownloadStats {
    return {
      ...this.stats,
      pending: this.limit.pendingCount,
    };
  }
}
