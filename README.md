# PresidenRI Photo Scraper (v2.0)

A fast, clean, and lightweight scraper and downloader for high-resolution gallery photos from [presidenri.go.id](https://www.presidenri.go.id/foto/). Built with Bun, TypeScript, SQLite, and the WordPress REST API.

Bypasses Cloudflare bot detection via TLS browser fingerprinting (`impit`) and live browser session cURL integration.

---

## ✨ Features

- **Pure API-First Architecture**: Interacts directly with the WordPress REST API (`/wp-json/wp/v2/photo`) — no messy HTML DOM scraping.
- **Original Full-Resolution Photos**: Resolves and downloads true full-res images, bypassing WordPress scaled (`-scaled`) and cropped thumbnails.
- **High Concurrency & Fast Storage**: Concurrent downloads powered by `p-limit` and metadata tracked locally in a Bun-native SQLite database (`bun:sqlite`).
- **Resilient Cloudflare Bypass**: Live hot-reloading of browser credentials with automatic 403 recovery.
- **Photo Timestamp Preservation**: Preserves original photo article publication dates on downloaded image files (`utimes`).

---

## 🚀 Quick Start

### 1. Install Dependencies

```bash
bun install
```

### 2. Configure Cloudflare Auth (Required)

1. Open `https://www.presidenri.go.id` in your browser.
2. Open DevTools (F12) -> Network tab.
3. Right click any request to `presidenri.go.id` -> **Copy as cURL**.
4. Run:

   ```bash
   bun run auth
   ```

5. Paste the cURL command into `storage/browser-request.curl`.

### 3. Run

```bash
# Scrape latest photo albums into SQLite database
bun run scrape

# Scrape and download full-resolution photos to ./downloads
bun run download

# Filter for specific keywords
bun run scrape --filter "prabowo" --download

# Scrape backwards from a specific year or date
bun run scrape --before 2024 --since 2024-01-01 --download
```

---

## 🛠️ CLI Commands

| Command | Description |
| :--- | :--- |
| `bun run scrape [options]` | Fetch articles and gallery photos from API into SQLite (`--download` to save images) |
| `bun run download` | Shortcut for `bun run scrape --download` |
| `bun run sync` | Download missing photos for all articles currently saved in SQLite |
| `bun run search <query>` | Search locally stored articles by title or description |
| `bun run stats` | View database count and local image download statistics |
| `bun run auth` | Initialize or verify `storage/browser-request.curl` |
| `bun test` | Run the test suite |

---

## 💡 Options for `scrape`

- `-d, --download`: Download photos while scraping.
- `-f, --force`: Re-process articles even if already marked as up-to-date.
- `--since <YYYY-MM-DD>`: Stop pagination at this publication date (Default: `2024-10-20`).
- `--before <date>`: Scrape backwards from this date.
- `--limit <n>`: Limit number of articles to process.
- `--filter <text>`: Filter articles by keyword.
- `--search <text>`: Server-side search on WordPress API.
- `--dry-run`: Simulate without modifying DB or downloading files.
- `-v, --verbose`: Enable detailed network logs.
