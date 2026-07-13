import { BROWSER_REQUEST_FILE, DEFAULT_RETRIES, BLOCK_WATCH_TIMEOUT, WORLD_READABLE_FILE_BIT, NO_BODY_STATUS_CODES, BACKOFF_BASE_MS, SHUTDOWN_POLL_MS, HTTP_BAD_REQUEST, HTTP_NOT_FOUND } from "../config/constants";
import { HEADERS } from "../config/headers";
import { parseBrowserRequestHeaders, findHeader } from "../utils";
import { Impit } from "impit";
import type { LoggerService } from "./LoggerService";
import type { RequestInit as ImpitRequestInit } from "impit";
import { existsSync, watch } from "node:fs";
import type { FSWatcher } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import * as path from "node:path";

export class CloudflareBlockError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "CloudflareBlockError";
  }
}

export class NetworkService {
  private headers: Record<string, string> = { ...HEADERS };
  private impit: Impit;
  private headersLoaded = false;
  private headersLastLoadedTime = 0;
  private isShuttingDown = false;
  private activeBlockResolution: Promise<boolean> | null = null;

  constructor(private logger?: LoggerService) {
    this.impit = new Impit({
        browser: "chrome"
    });
  }

  public setShuttingDown(value: boolean): void {
    this.isShuttingDown = value;
  }

  async refreshHeaders(): Promise<void> {
    if (existsSync(BROWSER_REQUEST_FILE)) {
      const content = await readFile(BROWSER_REQUEST_FILE, "utf8");
      const browserHeaders = parseBrowserRequestHeaders(content);
      if (Object.keys(browserHeaders).length > 0) {
        this.headers = browserHeaders;
      }

      // Security: warn if file is world-readable (contains credentials)
      try {
        const fileStat = await stat(BROWSER_REQUEST_FILE);
        const mode = fileStat.mode;
        if (mode & WORLD_READABLE_FILE_BIT) {
          this.logger?.warn(`⚠️ ${BROWSER_REQUEST_FILE} is world-readable. Consider: chmod 600 ${BROWSER_REQUEST_FILE}`);
        }
      } catch (statError) {
        this.logger?.warn(`Failed to check ${BROWSER_REQUEST_FILE} permissions: ${statError}`);
      }
    }
    this.headersLoaded = true;
    this.headersLastLoadedTime = Date.now();
  }

  async fetch(url: string, options: ImpitRequestInit & { verbose?: boolean; headers?: Record<string, string> } = {}, retries = DEFAULT_RETRIES): Promise<Response> {
    if (!this.headersLoaded) await this.refreshHeaders();

    const headers: Record<string, string> = {
      ...this.headers,
      ...options.headers,
    };

    const mergedOptions: ImpitRequestInit = {
      ...options,
      headers,
    };

    let lastError: Error | null = null;
    const toError = (value: unknown): Error =>
      value instanceof Error ? value : new Error(String(value));

    // Only log main API endpoint fetches, not media attachment sub-requests
    if (options.verbose && this.logger && !url.includes("/media?parent=")) {
      this.logger.info(`Fetching: ${url}`);
    }

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const impitResponse = await this.impit.fetch(url, mergedOptions);
        const response = this.buildResponse(impitResponse, mergedOptions.method);

        if (response.ok || response.status === HTTP_BAD_REQUEST || response.status === HTTP_NOT_FOUND) {
          return response;
        }

        // Route 403 into catch so all Cloudflare handling is in one place
        if (response.status === 403) {
          throw new Error("403 Forbidden");
        }

        // Non-403 server error: backoff and retry
        await this.backoff(attempt);
      } catch (error) {
        lastError = toError(error);

        if (lastError.message.includes("403")) {
          const reloaded = await this.handle403Block(url);
          if (reloaded) {
            mergedOptions.headers = {
              ...this.headers,
              ...options.headers,
            };
            attempt = -1; // Reset retry count after header reload
            continue;
          }
          // File not updated within timeout — give up
          const hasCookie = !!findHeader(headers, "cookie");
          throw new CloudflareBlockError(
            403,
            `403 Forbidden - Cloudflare is still blocking. \nHeaders in use: ${Object.keys(headers).join(", ")}\nCookie present: ${hasCookie}\n\nPlease ensure your storage/browser-request.curl has a FRESH request from a logged-in browser session.`
          );
        }

        // Non-403 error: backoff and retry
        await this.backoff(attempt);
      }
    }

    throw lastError || new Error(`Failed to fetch ${url} after ${retries} retries`);
  }

  private backoff(attempt: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, BACKOFF_BASE_MS * (attempt + 1)));
  }

  private buildResponse(impitResponse: { status: number; statusText: string; headers: Headers; body: ReadableStream<Uint8Array> | null; url: string }, method?: string): Response {
    const hasNoBody = NO_BODY_STATUS_CODES.includes(impitResponse.status) || method === "HEAD";
    const response = new Response(hasNoBody ? null : impitResponse.body, {
      status: impitResponse.status,
      statusText: impitResponse.statusText,
      headers: impitResponse.headers,
    });
    Object.defineProperty(response, "url", {
      value: impitResponse.url,
      writable: false,
    });
    return response;
  }

  private async handle403Block(url: string): Promise<boolean> {
    if (this.activeBlockResolution) {
      return this.activeBlockResolution;
    }

    this.activeBlockResolution = (async () => {
      if (this.logger) {
        this.logger.warn(`\n⚠️ Cloudflare block (403) detected on: ${url}`);
        this.logger.info(`Please copy a fresh request as cURL from your browser and paste it into:`);
        this.logger.info(`  ${BROWSER_REQUEST_FILE}`);
        this.logger.info(`Waiting for file update to resume...`);
      }

      const initialMtime = await this.getFileMtime();
      const { watcher, fileUpdatedPromise } = this.createFileWatcher(initialMtime);

      let updated = false;

      const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, BLOCK_WATCH_TIMEOUT));
      const checkShutdown = async () => {
        while (!updated && !this.isShuttingDown) {
          await new Promise((r) => setTimeout(r, SHUTDOWN_POLL_MS));
        }
      };

      const fileUpdated = await Promise.race([fileUpdatedPromise, timeoutPromise, checkShutdown()]);
      if (fileUpdated) updated = true;

      this.closeWatcher(watcher);
      this.activeBlockResolution = null;

      if (updated) {
        if (this.logger) this.logger.info(`Resuming fetch with fresh headers...`);
        return true;
      }
      return false;
    })();

    return this.activeBlockResolution;
  }

  private async getFileMtime(): Promise<number> {
    if (!existsSync(BROWSER_REQUEST_FILE)) return 0;
    try {
      const fileStat = await stat(BROWSER_REQUEST_FILE);
      return fileStat.mtimeMs;
    } catch (statError) {
      this.logger?.warn(`Failed to stat ${BROWSER_REQUEST_FILE}: ${statError}`);
      return 0;
    }
  }

  private createFileWatcher(initialMtime: number): {
    watcher: FSWatcher | undefined;
    fileUpdatedPromise: Promise<boolean>;
    markUpdated: () => void;
  } {
    let watcher: FSWatcher | undefined;
    let markUpdated: () => void = () => {};

    const fileUpdatedPromise = new Promise<boolean>((resolve) => {
      markUpdated = () => resolve(true);

      const dir = path.dirname(BROWSER_REQUEST_FILE);
      const filename = path.basename(BROWSER_REQUEST_FILE);

      try {
        watcher = watch(dir, async (_eventType: string | null, changedFilename: string | null) => {
          if (changedFilename !== filename && changedFilename) return;
          if (!existsSync(BROWSER_REQUEST_FILE)) return;

          try {
            const fileStat = await stat(BROWSER_REQUEST_FILE);
            if (fileStat.mtimeMs <= initialMtime) return;
            if (fileStat.mtimeMs > this.headersLastLoadedTime) {
              if (this.logger) this.logger.success(`\n✓ Detected browser-request.curl update. Reloading headers...`);
              await this.refreshHeaders();
            }
            markUpdated();
          } catch (statError) {
            this.logger?.warn(`Failed to stat ${BROWSER_REQUEST_FILE} during watch: ${statError}`);
          }
        });
      } catch (watchError) {
        this.logger?.warn(`Failed to set up file watcher: ${watchError}`);
      }
    });

    return { watcher, fileUpdatedPromise, markUpdated };
  }

  private closeWatcher(watcher: FSWatcher | undefined): void {
    if (!watcher) return;
    try {
      watcher.close();
    } catch (closeError) {
      this.logger?.warn(`Failed to close file watcher: ${closeError}`);
    }
  }
}
