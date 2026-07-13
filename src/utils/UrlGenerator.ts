import { DOMAIN, WWW_DOMAIN, BETA_DOMAIN } from "../config/constants";
import { addUnique } from "./array";

export class UrlGenerator {
  /**
   * Normalizes a URL to a canonical form: standardizes domain, path prefix,
   * and strips WordPress image suffixes (-scaled, -NNNxNNN, -eNNN cache busters).
   */
  static normalizeUrl(url: string): string {
    let clean = url;
    if (clean.includes(BETA_DOMAIN)) {
      clean = clean.replace(BETA_DOMAIN, WWW_DOMAIN);
    } else if (clean.includes(DOMAIN) && !clean.includes("www.")) {
      clean = clean.replace(DOMAIN, WWW_DOMAIN);
    }
    clean = clean.replace("/assets/uploads/", "/uploads/");

    // Strip WordPress image suffixes to get the canonical original URL.
    // WP 5.3+ creates -scaled (2560px) and the API sometimes returns these as source_url.
    const stripSuffix = (s: string) =>
      s.replace(/-(\d+x\d+|scaled|e\d+)(\.[a-z]+)$/i, "$2");
    let prev: string;
    do { prev = clean; clean = stripSuffix(clean); } while (clean !== prev);

    return clean;
  }

  static generateCandidates(originalUrl: string): string[] {
    const canonical = UrlGenerator.normalizeUrl(originalUrl);

    const urls: string[] = [];

    // Canonical (normalized, suffixes stripped) goes first — it's the original full-res.
    addUnique(urls, canonical);

    // If the original URL differs from canonical (e.g. had -scaled), add it as a fallback.
    let raw = originalUrl;
    if (raw.includes(BETA_DOMAIN)) raw = raw.replace(BETA_DOMAIN, WWW_DOMAIN);
    else if (raw.includes(DOMAIN) && !raw.includes("www.")) raw = raw.replace(DOMAIN, WWW_DOMAIN);
    raw = raw.replace("/assets/uploads/", "/uploads/");
    addUnique(urls, raw);

    // Path variations
    for (const url of [...urls]) {
      if (url.includes("/uploads/")) {
        addUnique(urls, url.replace("/uploads/", "/wp-content/uploads/"));
        addUnique(urls, url.replace("/uploads/", "/assets/uploads/"));
      }
    }

    // Strip size suffixes (-1024x768), -scaled, and cache-busters (-e\d+)
    const stripSuffix = (url: string) =>
      url.replace(/-(\d+x\d+|scaled|e\d+)(\.[a-z]+)$/i, "$2");
    for (const urlCandidate of [...urls]) {
      let current = urlCandidate;
      while (true) {
        const next = stripSuffix(current);
        if (next === current) break;
        current = next;
        addUnique(urls, current);
      }
    }

    return urls.sort((a, b) => a.length - b.length || a.localeCompare(b));
  }
}
