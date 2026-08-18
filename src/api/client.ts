import { Impit, type ImpitResponse } from "impit";
import {
  API_BASE,
  DEFAULT_PER_PAGE,
  DEFAULT_SINCE,
  DEFAULT_RETRIES,
  BACKOFF_BASE_MS,
  BROWSER_REQUEST_FILE,
} from "../config";
import { loadHeadersFromFile, watchForFileUpdate } from "../storage/curl";
import { normalizeImageUrl } from "./media";
import type { Article, WordPressPost, WordPressMedia, ScrapeOptions } from "../types";

export interface ClientFetchOptions {
  headers?: Record<string, string>;
  signal?: AbortSignal;
  verbose?: boolean;
  waitForAuth?: boolean;
}

export class PresidenClient {
  private impit = new Impit({
    browser: "chrome",
  });
  private headers: Record<string, string> = {};
  private headersLoaded = false;

  async init(): Promise<void> {
    if (!this.headersLoaded) {
      this.headers = await loadHeadersFromFile();
      this.headersLoaded = true;
    }
  }

  async fetch(
    url: string,
    options: ClientFetchOptions = {},
    retries = DEFAULT_RETRIES
  ): Promise<ImpitResponse> {
    await this.init();

    if (options.verbose) {
      console.log(`[HTTP] GET ${url}`);
    }

    let attempt = 0;
    while (attempt < retries) {
      try {
        const response = await this.impit.fetch(url, {
          signal: options.signal || AbortSignal.timeout(30_000),
          headers: {
            ...this.headers,
            ...(options.headers || {}),
          },
        });

        if (response.status === 403) {
          if (options.waitForAuth) {
            throw new Error("403 Cloudflare Block");
          }
          return response;
        }

        if (response.ok || response.status === 400 || response.status === 404) {
          return response;
        }

        // Other status codes (500, 502, 503, 520, etc.) -> retry with backoff
        await new Promise((r) => setTimeout(r, BACKOFF_BASE_MS * (attempt + 1)));
        attempt++;
      } catch (error) {
        const is403 = error instanceof Error && error.message.includes("403");
        if (is403 && options.waitForAuth) {
          console.warn(`\n⚠️ Cloudflare block (403) encountered for: ${url}`);
          console.warn(`👉 Please copy a fresh request as cURL from your browser into:\n   ${BROWSER_REQUEST_FILE}`);
          console.log(`Waiting for file update to resume...`);

          const updated = await watchForFileUpdate(BROWSER_REQUEST_FILE, 300_000);
          if (updated) {
            console.log(`✓ Detected browser-request.curl update. Reloading headers and retrying...`);
            this.headers = await loadHeadersFromFile();
            attempt = 0;
            continue;
          } else {
            throw new Error(`Cloudflare 403 block timed out waiting for fresh credentials in ${BROWSER_REQUEST_FILE}`);
          }
        }

        attempt++;
        if (attempt >= retries) {
          throw error;
        }
        await new Promise((r) => setTimeout(r, BACKOFF_BASE_MS * attempt));
      }
    }

    throw new Error(`Failed to fetch ${url} after ${retries} attempts`);
  }

  async getMediaForPost(postId: number, options: { verbose?: boolean } = {}): Promise<string[]> {
    const images: string[] = [];
    let page = 1;

    while (true) {
      const url = `${API_BASE}/media?parent=${postId}&per_page=100&page=${page}&_fields=id,source_url`;
      try {
        const response = await this.fetch(url, { verbose: options.verbose });
        if (!response.ok) break;

        const mediaItems = (await response.json()) as WordPressMedia[];
        if (!Array.isArray(mediaItems) || mediaItems.length === 0) break;

        for (const item of mediaItems) {
          if (item.source_url) {
            images.push(normalizeImageUrl(item.source_url));
          }
        }

        const totalPages = Number(response.headers.get("x-wp-totalpages") || "1");
        if (page >= totalPages) break;
        page++;
      } catch {
        break;
      }
    }

    return images;
  }

  async *streamArticles(options: ScrapeOptions = {}): AsyncGenerator<Article, void, unknown> {
    const postType = options.type || "photo";
    const stopDate = options.since || DEFAULT_SINCE;
    let page = 1;
    let totalYielded = 0;
    const limit = options.limit && options.limit > 0 ? options.limit : Infinity;

    while (totalYielded < limit) {
      let url = `${API_BASE}/${postType}?per_page=${DEFAULT_PER_PAGE}&page=${page}&_embed&_fields=id,date,modified,link,title,excerpt,_links,_embedded`;

      if (options.before) {
        url += `&before=${encodeURIComponent(options.before)}`;
      }
      if (options.search) {
        url += `&search=${encodeURIComponent(options.search)}`;
      }

      let response: ImpitResponse;
      try {
        response = await this.fetch(url, { verbose: options.verbose, waitForAuth: true });
      } catch (err) {
        if (options.verbose) {
          console.warn(`Error fetching ${url}:`, err);
        }
        break;
      }

      if (!response.ok) {
        if (options.verbose) {
          console.warn(`API returned status ${response.status} for ${url}`);
        }
        break;
      }

      const posts = (await response.json()) as WordPressPost[];
      if (!Array.isArray(posts) || posts.length === 0) {
        break;
      }

      for (const post of posts) {
        if (totalYielded >= limit) break;

        const dateStr = post.date ? post.date.substring(0, 10) : "";

        // Check if we hit the cutoff date (e.g. Prabowo start date 2024-10-20)
        if (stopDate && dateStr && dateStr < stopDate) {
          return;
        }

        const title = post.title?.rendered ? post.title.rendered.trim() : "";
        const description = post.excerpt?.rendered
          ? post.excerpt.rendered.replace(/<[^>]+>/g, "").replace(/\n/g, " ").trim()
          : "";

        // Local filter check
        if (options.filter) {
          const filterLower = options.filter.toLowerCase();
          const matchTitle = title.toLowerCase().includes(filterLower);
          const matchDesc = description.toLowerCase().includes(filterLower);
          if (!matchTitle && !matchDesc) {
            continue;
          }
        }

        // Fetch attached gallery images
        const galleryImages = await this.getMediaForPost(post.id, { verbose: options.verbose });

        // Fallback to featured media if no child attachments
        const images: string[] = [...galleryImages];
        if (images.length === 0) {
          const featured = post._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
          if (featured) {
            images.push(normalizeImageUrl(featured));
          }
        }

        const tags: string[] = [];
        if (post._embedded?.["wp:term"]) {
          for (const termGroup of post._embedded["wp:term"]) {
            for (const term of termGroup) {
              if (term.name) tags.push(term.name);
            }
          }
        }

        const article: Article = {
          postId: post.id,
          link: post.link,
          title,
          date: dateStr,
          description,
          tags,
          images,
          modified: post.modified,
        };

        totalYielded++;
        yield article;
      }

      const totalPages = Number(response.headers.get("x-wp-totalpages") || "1");
      if (page >= totalPages) break;
      page++;
    }
  }
}
