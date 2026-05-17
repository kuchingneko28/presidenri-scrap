export class UrlGenerator {
  /**
   * Generates a list of candidate URLs to try for a given image.
   * Handles domain variations, common WordPress path variations, 
   * and recursive stripping of image size suffixes.
   */
  static generateCandidates(originalUrl: string): string[] {
    const urls: string[] = [originalUrl];

    // Ensure we always use the www subdomain. Non-www is tarpitted by Cloudflare.
    if (!originalUrl.includes("www.presidenri.go.id") && originalUrl.includes("presidenri.go.id")) {
      urls[0] = originalUrl.replace("presidenri.go.id", "www.presidenri.go.id");
    }

    // Handle path variations
    const pathVariations = [...urls];
    for (const url of pathVariations) {
      if (url.includes("/assets/uploads/")) {
        urls.push(url.replace("/assets/uploads/", "/uploads/"));
        urls.push(url.replace("/assets/uploads/", "/wp-content/uploads/"));
      } else if (url.includes("/wp-content/uploads/")) {
        urls.push(url.replace("/wp-content/uploads/", "/uploads/"));
        urls.push(url.replace("/wp-content/uploads/", "/assets/uploads/"));
      } else if (url.includes("/uploads/")) {
        urls.push(url.replace("/uploads/", "/wp-content/uploads/"));
        urls.push(url.replace("/uploads/", "/assets/uploads/"));
      }
    }

    // Recursive suffix stripping to find original high-res versions
    const baseCandidates = [...urls];
    for (const u of baseCandidates) {
      let current = u;
      while (true) {
        // Strips -1024x768, -scaled, -e123456789 suffixes
        const next = current.replace(/-(\d+x\d+|scaled|e\d+)(\.[a-z]+)$/i, "$2");
        if (next === current) break;
        current = next;
        if (!urls.includes(current)) urls.push(current);
      }
    }

    return [...new Set(urls)];
  }
}
