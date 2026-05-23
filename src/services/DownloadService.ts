import { mkdirSync, utimesSync } from 'node:fs';
import path from 'node:path';
import pLimit from 'p-limit';
import { DOWNLOAD_DIR } from '../config/constants';
import type { DownloadItem } from '../types';
import { sanitize } from '../utils';
import { UrlGenerator } from '../utils/UrlGenerator';
import type { LoggerService } from './LoggerService';
import type { NetworkService } from './NetworkService';

export class DownloadService {
  private limit = pLimit(5);
  private stats = {
    queued: 0,
    active: 0,
    done: 0,
    failed: 0,
    bytesDownloaded: 0,
    bytesTotal: 0,
  };

  constructor(
    private logger: LoggerService,
    private network: NetworkService,
    concurrency: number = 5
  ) {
    this.limit = pLimit(concurrency);
  }

  private isShuttingDown = false;

  public setShuttingDown(value: boolean): void {
    this.isShuttingDown = value;
  }

  async download(item: DownloadItem, verbose = false): Promise<void> {
    this.stats.queued++;

    return this.limit(async () => {
      if (this.isShuttingDown) return;
      this.stats.active++;
      try {
        const filePath = this.getFilePath(item);
        if (await this.checkFileExists(filePath, verbose, item)) return;

        const { response, buffer } = await this.fetchWithFallbacks(item, verbose);
        await this.saveFile(filePath, buffer, response, item);

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
    mkdirSync(folderPath, { recursive: true });

    const urlPath = item.imageUrl.split('?')[0] || '';
    const originalFileName = path.basename(urlPath);
    const fileName = originalFileName.includes('.') ? originalFileName : `image_${item.index}.jpg`;
    return path.join(folderPath, fileName);
  }

  private async checkFileExists(filePath: string, verbose: boolean, item: DownloadItem): Promise<boolean> {
    const file = Bun.file(filePath);
    if (await file.exists()) {
      if (verbose) this.logger.info(`Skipping existing: ${path.basename(filePath)}`);
      await new Promise(r => setTimeout(r, 1));
      this.stats.done++;
      return true;
    }
    return false;
  }

  private async fetchWithFallbacks(item: DownloadItem, verbose: boolean): Promise<{ response: Response, buffer: Uint8Array }> {
    const uniqueUrls = UrlGenerator.generateCandidates(item.imageUrl);
    let lastError: Error | undefined;

    for (const url of uniqueUrls) {
      let currentBytesTotal = 0;
      let currentBytesDownloaded = 0;
      try {
        if (verbose && url !== item.imageUrl) this.logger.info(`Trying fallback: ${url}`);
        
        const response = await this.network.fetch(url, { verbose, timeout: 300000 }, 1);
        this.validateResponse(response);

        const contentLength = parseInt(response.headers.get('Content-Length') || '0', 10);
        if (contentLength > 0) {
          currentBytesTotal = contentLength;
          this.stats.bytesTotal += contentLength;
        }

        let receivedLength = 0;
        let chunks: Uint8Array[] = [];

        try {
          if (response.body) {
            const { length, data } = await this.readStream(response.body);
            receivedLength = length;
            chunks = data;
          } else {
            const ab = await response.arrayBuffer();
            receivedLength = ab.byteLength;
            chunks = [new Uint8Array(ab)];
          }
          currentBytesDownloaded += receivedLength;
          this.stats.bytesDownloaded += receivedLength;
          if (contentLength === 0) {
            currentBytesTotal = receivedLength;
            this.stats.bytesTotal += receivedLength;
          }
        } finally {
          if (contentLength === 0 && receivedLength > 0 && response.body) {
            currentBytesTotal = receivedLength;
            this.stats.bytesTotal += receivedLength;
          }
        }

        const buffer = this.concatChunks(chunks, receivedLength);
        if (buffer.byteLength < 500) throw new Error('File too small');

        return { response, buffer };
      } catch (error) {
        this.stats.bytesTotal -= currentBytesTotal;
        this.stats.bytesDownloaded -= currentBytesDownloaded;
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

  private async readStream(body: ReadableStream<Uint8Array>): Promise<{ length: number, data: Uint8Array[] }> {
    let receivedLength = 0;
    const chunks: Uint8Array[] = [];
    const reader = body.getReader();
    
    let timeoutErr: Error | null = null;
    let timeoutId: NodeJS.Timeout | null = null;

    const resetTimeout = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        timeoutErr = new Error('Stream read timeout (tarpit detected)');
        reader.cancel().catch(() => {});
      }, 30000);
    };

    resetTimeout();

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

  private checkCloudflareBlock(error: Error): void {
    if (error.message.includes("403")) {
      if (!this.isShuttingDown) {
        this.isShuttingDown = true;
        this.logger.error(`\nCRITICAL: Cloudflare block detected during download. Aborting!`);
        process.kill(process.pid, "SIGINT");
      }
      throw error;
    }
  }

  private async saveFile(filePath: string, buffer: Uint8Array, response: Response, item: DownloadItem): Promise<void> {
    await Bun.write(filePath, buffer);
    const lastModified = response.headers.get('Last-Modified');
    const mtime = lastModified ? new Date(lastModified) : new Date(item.date);
    if (!isNaN(mtime.getTime())) {
      utimesSync(filePath, mtime, mtime);
    }
  }

  async waitForIdle(): Promise<void> {
    while (this.stats.queued > this.stats.done + this.stats.failed) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  getStats() {
    return {
      ...this.stats,
      pending: this.limit.pendingCount,
    };
  }
}
