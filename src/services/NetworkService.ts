import { BROWSER_REQUEST_FILE } from "../config/constants";
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

  async fetch(url: string, options: ImpitRequestInit & { verbose?: boolean } = {}, retries = 3): Promise<Response> {
    if (!this.headersLoaded) await this.refreshHeaders();

    const headers: Record<string, string> = {
      ...this.headers,
      ...(options.headers as Record<string, string>),
    };

    const mergedOptions: ImpitRequestInit = {
      ...options,
      headers,
    };

    const customUA = findHeader(headers, "user-agent");
    
    let lastError: Error | null = null;

    if (options.verbose && this.logger) {
      this.logger.info(`Fetching: ${url}`);
    }

    for (let i = 0; i < retries; i++) {
      try {
        const response = await this.impit.fetch(url, mergedOptions) as unknown as Response;
        
        if (response.ok || response.status === 400 || response.status === 404) {
          return response;
        }
        
        if (response.status === 403) {
          const reloaded = await this.handle403Block(url, headers);
          if (reloaded) {
            mergedOptions.headers = {
              ...this.headers,
              ...(options.headers as Record<string, string>),
            };
            i = -1;
            continue;
          }
          const hasCookie = !!findHeader(headers, "cookie");
          throw new Error(`403 Forbidden - Cloudflare is still blocking. \nHeaders in use: ${Object.keys(headers).join(", ")}\nCookie present: ${hasCookie}\n\nPlease ensure your storage/browser-request.curl has a FRESH request from a logged-in browser session.`);
        }
        
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      } catch (error) {
        lastError = error as Error;
        if (lastError.message.includes("403")) {
          const reloaded = await this.handle403Block(url, headers);
          if (reloaded) {
            mergedOptions.headers = {
              ...this.headers,
              ...(options.headers as Record<string, string>),
            };
            i = -1;
            continue;
          }
          throw lastError;
        }
        
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
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

    // Poll for file changes
    for (let poll = 0; poll < 300; poll++) { // Wait up to 5 minutes
      if (this.isShuttingDown) break;
      await new Promise(r => setTimeout(r, 1000));
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
