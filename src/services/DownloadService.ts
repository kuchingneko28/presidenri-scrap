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
      if (this.isShuttingDown) {
        return;
      }
      this.stats.active++;
      try {
        const folderName = `${item.date} - ${sanitize(item.title)}`;
        const folderPath = path.join(DOWNLOAD_DIR, folderName);
        mkdirSync(folderPath, { recursive: true });

        const urlPath = item.imageUrl.split('?')[0] || '';
        const originalFileName = path.basename(urlPath);
        const fileName = originalFileName.includes('.')
          ? originalFileName
          : `image_${item.index}.jpg`;
        const filePath = path.join(folderPath, fileName);

        const file = Bun.file(filePath);
        if (await file.exists()) {
          if (verbose) {
            this.logger.info(`Skipping existing: ${fileName}`);
          }
          await new Promise(r => setTimeout(r, 1)); // Prevent tight loop of stat calls from maxing CPU
          this.stats.done++;
          return;
        }

        const uniqueUrls = UrlGenerator.generateCandidates(item.imageUrl);

        let response: Response | undefined;
        let buffer: ArrayBuffer | Uint8Array | undefined;
        let lastError: Error | undefined;

        let success = false;
        for (const url of uniqueUrls) {
          let currentBytesTotal = 0;
          let currentBytesDownloaded = 0;
          try {
            if (verbose && url !== item.imageUrl) {
              this.logger.info(`Trying fallback: ${url}`);
            }

            response = await this.network.fetch(
              url,
              {
                verbose
              },
              1
            );

            const contentType = response.headers.get('Content-Type') || '';
            if (!response.ok || (!contentType.startsWith('image/') && response.status !== 404)) {
              throw new Error(`Invalid response (${response.status})`);
            }

            const contentLength = parseInt(response.headers.get('Content-Length') || '0', 10);
            if (contentLength > 0) {
              currentBytesTotal = contentLength;
              this.stats.bytesTotal += contentLength;
            }

            let receivedLength = 0;
            const chunks: Uint8Array[] = [];

            try {
              if (response.body) {
                const reader = response.body.getReader();
                while (true) {
                  let timeoutId: NodeJS.Timeout;
                  const timeoutPromise = new Promise<never>((_, reject) => {
                    timeoutId = setTimeout(() => {
                      reader.cancel().catch(() => {});
                      reject(new Error('Stream read timeout (tarpit detected)'));
                    }, 30000);
                  });

                  try {
                    const { done, value } = await Promise.race([reader.read(), timeoutPromise]);
                    if (done) break;
                    if (value) {
                      chunks.push(value);
                      receivedLength += value.length;
                      currentBytesDownloaded += value.length;
                      this.stats.bytesDownloaded += value.length;
                    }
                  } finally {
                    clearTimeout(timeoutId!);
                  }
                }
              } else {
                const ab = await response.arrayBuffer();
                receivedLength = ab.byteLength;
                chunks.push(new Uint8Array(ab));
                currentBytesDownloaded += receivedLength;
                this.stats.bytesDownloaded += receivedLength;
                if (contentLength === 0) {
                  currentBytesTotal = receivedLength;
                  this.stats.bytesTotal += receivedLength;
                }
              }
            } finally {
              // We intentionally DO NOT subtract the bytes here on success.
              // This makes the progress cumulative (ever-growing) instead of jumping up and down.
              if (contentLength === 0 && receivedLength > 0 && response.body) {
                // If there was no content length but we streamed it, add it to total now
                currentBytesTotal = receivedLength;
                this.stats.bytesTotal += receivedLength;
              }
            }

            const uint8Buffer = new Uint8Array(receivedLength);
            let position = 0;
            for (const chunk of chunks) {
              uint8Buffer.set(chunk, position);
              position += chunk.length;
            }
            buffer = uint8Buffer;

            if (buffer.byteLength < 500) {
              throw new Error('File too small');
            }

            success = true;
            break;
          } catch (error) {
            this.stats.bytesTotal -= currentBytesTotal;
            this.stats.bytesDownloaded -= currentBytesDownloaded;
            lastError = error as Error;
            if (verbose) {
              this.logger.warn(`Fetch failed for ${url}: ${(error as Error).message}`);
            }
            if (lastError.message.includes("403")) {
              this.logger.error(`\nCRITICAL: Cloudflare block detected during download. Aborting!`);
              process.kill(process.pid, "SIGINT");
              throw lastError;
            }
          }
        }

        if (!success || !response || !buffer) {
          throw lastError || new Error('All URL candidates failed');
        }

        await Bun.write(filePath, buffer);

        // Preserve metadata (Modification Time)
        const lastModified = response.headers.get('Last-Modified');
        const mtime = lastModified ? new Date(lastModified) : new Date(item.date);
        if (!isNaN(mtime.getTime())) {
          utimesSync(filePath, mtime, mtime);
        }

        if (verbose) this.logger.success(`Downloaded: ${fileName}`);
        this.stats.done++;
      } catch (error) {
        this.stats.failed++;
        this.logger.error(`Download failed: ${item.imageUrl} - ${error}`);
      } finally {
        this.stats.active--;
      }
    });
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
