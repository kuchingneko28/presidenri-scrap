import * as cheerio from "cheerio";
import { UrlGenerator } from "./UrlGenerator";
import { DOMAIN } from "../config/constants";

export class MediaParser {
  /**
   * Extracts image URLs from the slider component used in legacy pages.
   */
  static extractFromSlider($: cheerio.CheerioAPI, baseUrl: string): string[] {
    const images: string[] = [];
    const seen = new Set<string>();

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

    // Fallback to fancybox links
    if (images.length === 0) {
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
    }

    return images;
  }

  /**
   * Extracts image URLs from a block of HTML content (like WordPress content.rendered).
   */
  static extractFromHtml(html: string, baseUrl: string = `https://${DOMAIN}`): string[] {
    const images: string[] = [];
    const $ = cheerio.load(html);

    $("img").each((_, img) => {
      const src = $(img).attr("src");
      const srcset = $(img).attr("srcset") || $(img).attr("data-srcset");
      
      if (src) {
        const url = this.resolveUrl(src, baseUrl);
        if (url) {
          images.push(url);
        }
      }
      
      if (srcset) {
        const parts = srcset.split(",").map(part => part.trim().split(" ")[0]);
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
      if (href && href.match(/\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i)) {
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
