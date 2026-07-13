import * as cheerio from "cheerio";
import { UrlGenerator } from "./UrlGenerator";
import { DOMAIN, IMAGE_FILE_EXTENSION_PATTERN } from "../config/constants";

export class MediaParser {
  /**
   * Extracts full-res image URLs from a raw HTML page string.
   * Convenience wrapper around extractFromSlider for cases where you have
   * the HTML string rather than a cheerio instance.
   */
  static extractFromPageHtml(html: string, pageUrl: string): string[] {
    const $ = cheerio.load(html);
    return this.extractFromSlider($, pageUrl);
  }

  /**
   * Extracts image URLs from the slider component used in photo pages.
   * Prefers fancybox links (full-res) over flexslider img src (thumbnails).
   */
  static extractFromSlider($: cheerio.CheerioAPI, baseUrl: string): string[] {
    const images: string[] = [];
    const seen = new Set<string>();

    // Priority 1: fancybox links — these contain the full-resolution URLs
    $("a[data-fancybox]").each((_, anchorElement) => {
      const href = $(anchorElement).attr("href");
      if (href) {
        const url = this.resolveUrl(href, baseUrl);
        if (url && !seen.has(url)) {
          seen.add(url);
          images.push(url);
        }
      }
    });

    // Priority 2: flexslider img src — thumbnails, used as fallback
    if (images.length === 0) {
      $(".flexslider .slides li img").each((_, imgElement) => {
        const src = $(imgElement).attr("src") || $(imgElement).attr("data-src");
        if (src) {
          const url = this.resolveUrl(src, baseUrl);
          if (url && !seen.has(url)) {
            seen.add(url);
            images.push(url);
          }
        }
      });
    }

    return images;
  }

  /**
   * Extracts image URLs from a block of HTML content (like WordPress content.rendered).
   */
  static extractFromHtml(html: string, baseUrl: string = `https://${DOMAIN}`): string[] {
    const images: string[] = [];
    const $ = cheerio.load(html);

    $("img").each((_, imgElement) => {
      const src = $(imgElement).attr("src");
      const srcset = $(imgElement).attr("srcset") || $(imgElement).attr("data-srcset");
      
      if (src) {
        const url = this.resolveUrl(src, baseUrl);
        if (url) {
          images.push(url);
        }
      }
      
      if (srcset) {
        const parts = srcset.split(",").map(srcsetEntry => srcsetEntry.trim().split(" ")[0]);
        for (const part of parts) {
          if (part) {
            const url = this.resolveUrl(part, baseUrl);
            if (url) {
              images.push(url);
            }
          }
        }
      }
    });

    $("a").each((_, anchorElement) => {
      const href = $(anchorElement).attr("href");
      if (href && href.match(IMAGE_FILE_EXTENSION_PATTERN)) {
        const url = this.resolveUrl(href, baseUrl);
        if (url) {
          images.push(url);
        }
      }
    });

    return [...new Set(images)];
  }

  private static resolveUrl(url: string, baseUrl: string): string {
    try {
      const resolved = new URL(url, baseUrl).toString();
      return this.cleanUrl(resolved);
    } catch {
      return "";
    }
  }

  private static cleanUrl(url: string): string {
    return UrlGenerator.normalizeUrl(url);
  }
}
