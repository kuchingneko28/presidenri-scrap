import { DOMAIN, WWW_DOMAIN } from "../config/constants";

export class UrlGenerator {
  static generateCandidates(originalUrl: string): string[] {
    const baseUrl = originalUrl.includes(DOMAIN) && !originalUrl.includes("www.")
      ? originalUrl.replace(DOMAIN, WWW_DOMAIN)
      : originalUrl;

    const urls: string[] = [];

    const add = (url: string) => { if (!urls.includes(url)) urls.push(url); };

    add(baseUrl);

    // Stripping -scaled gets the ORIGINAL full-res upload;
    // photo-scaled.jpg is the 2560px version created by WP 5.3+
    const stripSuffix = (url: string) =>
      url.replace(/-(\d+x\d+|scaled|e\d+)(\.[a-z]+)$/i, "$2");

    // Path variations
    for (const url of [...urls]) {
      if (url.includes("/assets/uploads/")) {
        add(url.replace("/assets/uploads/", "/uploads/"));
        add(url.replace("/assets/uploads/", "/wp-content/uploads/"));
      } else if (url.includes("/wp-content/uploads/")) {
        add(url.replace("/wp-content/uploads/", "/uploads/"));
        add(url.replace("/wp-content/uploads/", "/assets/uploads/"));
      } else if (url.includes("/uploads/")) {
        add(url.replace("/uploads/", "/wp-content/uploads/"));
        add(url.replace("/uploads/", "/assets/uploads/"));
      }
    }

    // Strip size suffixes (-1024x768), -scaled, and cache-busters (-e\d+)
    for (const u of [...urls]) {
      let current = u;
      while (true) {
        const next = stripSuffix(current);
        if (next === current) break;
        current = next;
        add(current);
      }
    }

    return urls;
  }
}
