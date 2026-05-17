# PresidenRI Scraper

A high-performance, concurrent web scraper for [presidenri.go.id](https://www.presidenri.go.id) built with **Bun**, **TypeScript**, and **SQLite**. Refactored for a modern service-oriented architecture with browser impersonation and robust error handling.

## ✨ Features

- **Service-Oriented Architecture**: Modular design with dedicated services for Network, Database, Logging, and Downloads.
- **Browser Impersonation**: Uses `impit` to mimic real browser TLS fingerprints and header ordering, bypassing Cloudflare protection.
- **Concurrent Processing**: Multi-threaded downloads using `p-limit` and Bun's native async I/O.
- **Keyword Filtering**: Targeted scraping using the `--filter` flag (e.g., only process "Prabowo").
- **Reliable Downloads**:
  - **Auto-Retries**: 3-retry mechanism for every download to handle network timeouts.
  - **Integrity Checks**: Minimum file size verification to prevent corrupt or blocked responses.
  - **Metadata Preservation**: Sets file modification times (mtime) from server headers or publication dates.
- **Resumable & Smart**:
  - Tracks processed articles in SQLite to prevent redundant downloads.
  - Automatically re-downloads missing folders even if the article is in the database (when using `--download`).
- **Clean CLI**: Powered by `cac` with full verbose logging and graceful shutdown handling.

## 🚀 Requirements

- [Bun](https://bun.sh) (v1.0+)
- Linux/macOS/Windows

## 📦 Installation

```bash
bun install
```

## 🛡️ Cloudflare Bypass

PresidenRI uses Cloudflare protection. To bypass it:

1. Open your browser and navigate to the PresidenRI site.
2. Open **Developer Tools** -> **Network** tab.
3. Right-click any request to `wp-json` or a main page.
4. Select **Copy** -> **Copy as cURL**.
5. Run `bun run request` to create the storage file if it doesn't exist.
6. Paste the cURL command into `storage/browser-request.curl`.

The scraper will automatically extract the necessary cookies and headers.

## 🛠️ Usage

### 1. API Scraper (Recommended)

Scrapes using the WordPress REST API. Fast and efficient.

```bash
# Scrape the first page
bun run api

# Scrape and download images for "Prabowo" articles
bun run api --filter prabowo --download --verbose

# Force re-scraping of all articles
bun run api --force
```

### 2. Legacy Scraper

Scrapes the HTML directly. Useful if the API is restricted.

```bash
# Update mode: stops after 3 pages of no new articles (great for cron jobs)
bun run legacy --update --download

# Scrape everything until the year limit
bun run legacy --all --download
```

### 3. Database Stats

```bash
bun run stats
```

## ⚙️ Configuration

Settings can be adjusted in `src/config/constants.ts`:

- `YEAR_LIMIT`: Stop scraping articles older than this year.
- `STOP_DATE`: Hard stop for the API scraper.
- `STORAGE_DIR`: Location for `data.db` and logs.
- `DOWNLOAD_DIR`: Location for downloaded images.

## 📂 Project Structure

- `src/services/`: Core logic (Database, Network, Logger, etc.)
- `src/scrapers/`: Domain logic for different scraping methods.
- `src/types/`: Strict TypeScript definitions.
- `src/utils/`: Shared helper functions.
- `storage/`: Persistent data and browser request config.
- `downloads/`: Organized image folders (`YYYY-MM-DD - Title`).

## 📜 License

MIT
