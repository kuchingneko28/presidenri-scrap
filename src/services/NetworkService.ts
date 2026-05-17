import { BROWSER_REQUEST_FILE } from "../config/constants";
import { HEADERS } from "../config/headers";
import { parseBrowserRequestHeaders, findHeader } from "../utils";
import { Impit } from "impit";
import type { LoggerService } from "./LoggerService";

export class NetworkService {
  private headers: Record<string, string> = { ...HEADERS };
  private impit: Impit;
  private headersLoaded = false;

  constructor(private logger?: LoggerService) {
    this.impit = new Impit({
        browser: "chrome"
    });
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
  }

  async getHeaders(): Promise<Record<string, string>> {
    if (!this.headersLoaded) await this.refreshHeaders();
    return { ...this.headers };
  }

  async fetch(url: string, options: RequestInit & { verbose?: boolean } = {}, retries = 3): Promise<Response> {
    if (!this.headersLoaded) await this.refreshHeaders();

    const headers: Record<string, string> = {
      ...this.headers,
      ...(options.headers as Record<string, string>),
    };

    const mergedOptions = {
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
        const response = await this.impit.fetch(url, mergedOptions as any) as unknown as Response;
        
        if (response.ok || response.status === 400 || response.status === 404) {
          return response;
        }
        
        if (response.status === 403) {
           const hasCookie = !!findHeader(headers, "cookie");
           throw new Error(`403 Forbidden - Cloudflare is still blocking. \nHeaders in use: ${Object.keys(headers).join(", ")}\nCookie present: ${hasCookie}\n\nPlease ensure your storage/browser-request.curl has a FRESH request from a logged-in browser session.`);
        }
        
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      } catch (error) {
        lastError = error as Error;
        if (lastError.message.includes("403")) throw lastError;
        
        await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
      }
    }

    throw lastError || new Error(`Failed to fetch ${url} after ${retries} retries`);
  }
}
