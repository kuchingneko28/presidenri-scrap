import { BROWSER_REQUEST_FILE, DEFAULT_RETRIES } from "../config/constants";
import { HEADERS } from "../config/headers";
import { parseBrowserRequestHeaders, findHeader } from "../utils";
import { Impit } from "impit";
import type { LoggerService } from "./LoggerService";
import type { RequestInit as ImpitRequestInit } from "impit";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";

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
        const impitResponse = await this.impit.fetch(url, mergedOptions);
        const hasNoBody = [101, 204, 205, 304].includes(impitResponse.status) || mergedOptions.method === "HEAD";
        const response = new Response(hasNoBody ? null : impitResponse.body, {
          status: impitResponse.status,
          statusText: impitResponse.statusText,
          headers: impitResponse.headers,
        });
        Object.defineProperty(response, "url", {
          value: impitResponse.url,
          writable: false,
        });

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
          throw new CloudflareBlockError(
            403,
            `403 Forbidden - Cloudflare is still blocking. \nHeaders in use: ${Object.keys(headers).join(", ")}\nCookie present: ${hasCookie}\n\nPlease ensure your storage/browser-request.curl has a FRESH request from a logged-in browser session.`
          );
        }

        // Non-403 error: backoff and retry
        await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }

    throw lastError || new Error(`Failed to fetch ${url} after ${retries} retries`);
  }

  private async handle403Block(url: string, currentHeaders: Record<string, string>): Promise<boolean> {
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

      let initialMtime = 0;
      if (existsSync(BROWSER_REQUEST_FILE)) {
        try {
          const fileStat = await stat(BROWSER_REQUEST_FILE);
          initialMtime = fileStat.mtimeMs;
        } catch {}
      }
      let updated = false;

      // Poll for file changes (up to ~5 minutes)
      for (let poll = 0; poll < 300; poll++) {
        if (this.isShuttingDown) break;
        await new Promise(resolve => setTimeout(resolve, 1000));
        if (existsSync(BROWSER_REQUEST_FILE)) {
          try {
            const fileStat = await stat(BROWSER_REQUEST_FILE);
            if (fileStat.mtimeMs > initialMtime) {
              updated = true;
              if (fileStat.mtimeMs > this.headersLastLoadedTime) {
                if (this.logger) this.logger.success(`\n✓ Detected browser-request.curl update. Reloading headers...`);
                await this.refreshHeaders();
              }
              break;
            }
          } catch {}
        }
      }

      this.activeBlockResolution = null;

      if (updated) {
        if (this.logger) this.logger.info(`Resuming fetch with fresh headers...`);
        return true;
      }
      return false;
    })();

    return this.activeBlockResolution;
  }
}
