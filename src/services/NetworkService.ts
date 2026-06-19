import { BROWSER_REQUEST_FILE, DEFAULT_RETRIES } from "../config/constants";
import { HEADERS } from "../config/headers";
import { parseBrowserRequestHeaders, findHeader } from "../utils";
import { Impit } from "impit";
import type { LoggerService } from "./LoggerService";
import type { RequestInit as ImpitRequestInit } from "impit";

export class NetworkService {
  private headers: Record<string, string> = { ...HEADERS };
  private impit: Impit;
  private headersLoaded = false;
  private headersLastLoadedTime = 0;
  private isShuttingDown = false;

  constructor(private logger?: LoggerService) {
    this.impit = new Impit({
        browser: "chrome"
    });
  }

  public setShuttingDown(value: boolean): void {
    this.isShuttingDown = value;
  }

  async refreshHeaders(): Promise<void> {
    const file = Bun.file(BROWSER_REQUEST_FILE);
    if (await file.exists()) {
      const content = await file.text();
      const browserHeaders = parseBrowserRequestHeaders(content);
      if (Object.keys(browserHeaders).length > 0) {
        this.headers = browserHeaders;
      }
    }
    this.headersLoaded = true;
    this.headersLastLoadedTime = Date.now();
  }

  async getHeaders(): Promise<Record<string, string>> {
    if (!this.headersLoaded) await this.refreshHeaders();
    return { ...this.headers };
  }

  async fetch(url: string, options: ImpitRequestInit & { verbose?: boolean } = {}, retries = DEFAULT_RETRIES): Promise<Response> {
    if (!this.headersLoaded) await this.refreshHeaders();

    const headers: Record<string, string> = {
      ...this.headers,
      ...(options.headers as Record<string, string>),
    };

    const mergedOptions: ImpitRequestInit = {
      ...options,
      headers,
    };

    let lastError: Error | null = null;

    if (options.verbose && this.logger) {
      this.logger.info(`Fetching: ${url}`);
    }

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await this.impit.fetch(url, mergedOptions) as unknown as Response;

        if (response.ok || response.status === 400 || response.status === 404) {
          return response;
        }

        // Route 403 into catch so all Cloudflare handling is in one place
        if (response.status === 403) {
          throw new Error("403 Forbidden");
        }

        // Non-403 server error: backoff and retry
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      } catch (error) {
        lastError = error as Error;

        if (lastError.message.includes("403")) {
          const reloaded = await this.handle403Block(url, headers);
          if (reloaded) {
            mergedOptions.headers = {
              ...this.headers,
              ...(options.headers as Record<string, string>),
            };
            attempt = -1; // Reset retry count after header reload
            continue;
          }
          // File not updated within timeout — give up
          const hasCookie = !!findHeader(headers, "cookie");
          throw new Error(`403 Forbidden - Cloudflare is still blocking. \nHeaders in use: ${Object.keys(headers).join(", ")}\nCookie present: ${hasCookie}\n\nPlease ensure your storage/browser-request.curl has a FRESH request from a logged-in browser session.`);
        }

        // Non-403 error: backoff and retry
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    throw lastError || new Error(`Failed to fetch ${url} after ${retries} retries`);
  }

  private async handle403Block(url: string, currentHeaders: Record<string, string>): Promise<boolean> {
    if (this.logger) {
      this.logger.warn(`\n⚠️ Cloudflare block (403) detected on: ${url}`);
      this.logger.info(`Please copy a fresh request as cURL from your browser and paste it into:`);
      this.logger.info(`  ${BROWSER_REQUEST_FILE}`);
      this.logger.info(`Waiting for file update to resume...`);
    }

    const file = Bun.file(BROWSER_REQUEST_FILE);
    const initialMtime = (await file.exists()) ? (await file.stat()).mtimeMs : 0;
    let updated = false;

    // Poll for file changes (up to ~5 minutes)
    for (let poll = 0; poll < 300; poll++) {
      if (this.isShuttingDown) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
      if (await file.exists()) {
        const stat = await file.stat();
        if (stat.mtimeMs > initialMtime) {
          updated = true;
          if (stat.mtimeMs > this.headersLastLoadedTime) {
            if (this.logger) this.logger.success(`\n✓ Detected browser-request.curl update. Reloading headers...`);
            await this.refreshHeaders();
          }
          break;
        }
      }
    }

    if (updated) {
      if (this.logger) this.logger.info(`Resuming fetch with fresh headers...`);
      return true;
    }
    return false;
  }
}
