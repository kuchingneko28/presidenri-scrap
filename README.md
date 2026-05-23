# PresidenRI Photo Scraper

Just a quick script to grab high-resolution gallery photos from [presidenri.go.id/foto](https://presidenri.go.id/foto/). Built with Bun, TypeScript, and SQLite.

It bypasses Cloudflare using TLS fingerprinting via `impit`, so it runs without getting blocked easily.

## What it does

- **Gets the actual high-res photos** from the galleries (not just the thumbnails).
- **Fast**: Runs downloads in parallel and caches posts in a local SQLite DB so it won't re-download what you already have.
- **Resilient**: If a download fails or Cloudflare blocks it, it waits for you to update cookies, retries, and keeps going.
- **Saves logs** under `storage/logs/` and updates the file timestamps on downloaded images to match when the photo article was published.

## Quick Start

1. Install dependencies:
   ```bash
   bun install
   ```

2. Bypass Cloudflare (Required):
   - Open your browser, go to `presidenri.go.id`, and copy any request as cURL from DevTools.
   - Run `bun run request` to create the config file.
   - Paste the cURL command into `storage/browser-request.curl`.

3. Run the scraper:
   ```bash
   # Scrape the first page and download images (recommended WordPress API scraper)
   bun run api --download

   # Filter for a specific topic/person
   bun run api --filter prabowo --download

   # Force it to re-check already scraped articles
   bun run api --force --download
   ```

## Commands

- `bun run api` - WordPress REST API scraper (very fast).
- `bun run legacy` - HTML-scraping fallback if the API gets disabled.
- `bun run sync` - Downloads images for articles that are already in your DB but missing from your local folder.
- `bun run stats` - See how many articles you've saved so far.
- `bun run request` - Initializes the browser request file.

## Troubleshooting

- **403 errors (Cloudflare block)**: Just update the `storage/browser-request.curl` file with a fresh request from your browser. The running script will detect the change, reload headers, and resume automatically without you having to restart it!
