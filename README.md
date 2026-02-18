# PresidenRI Scraper

A robust, concurrent web scraper for [presidenri.go.id](https://www.presidenri.go.id) built with Bun, TypeScript, and SQLite.

## Features

- **Concurrent Downloading**: Uses a Producer-Consumer pattern to scrape pages and download images in parallel.
- **Smart Tagging**: Automatically categorizes articles based on URL path (e.g., `Foto`, `Siaran Pers`).
- **Resumable**: Tracks downloaded articles in a SQLite database to prevent duplicates.
- **Smart Updates**: Stop automatically when no new articles are found (Daily Mode).
- **Metadata Preservation**: Preserves original image timestamps (`Last-Modified` header) and clean filenames.
- **Robust Network Handling**: Automatic retries with exponential backoff for reliable scraping.
- **Organized Storage**:
  - `downloads/YYYY-MM-DD - Title/`: Images stored in dated folders.
  - `storage/data.db`: SQLite database.
  - `storage/cookies.txt`: Cookie storage (optional).

## Requirements

- [Bun](https://bun.sh) (v1.0+)

## Installation

```bash
bun install
```

## Usage

You can use the built-in scripts for common tasks:

### 1. Scrape Only (No Download)

Crawls pages and saves article metadata to the database.

```bash
bun run start
# OR
bun run src/index.ts
```

### 2. Scrape & Download (Recommended)

Crawls and downloads images concurrently.

```bash
bun run download
```

### 3. Smart Update

Checks for new articles and stops after 3 empty pages. Ideal for cron jobs.

```bash
bun run update
```

### 4. Download All History

Scrapes ALL pages (from page 1 to end).

```bash
bun run download:all
```

### 5. View Stats

Shows the number of articles in the database.

```bash
bun run stats
```

## Configuration

Configuration is handled via command-line arguments.
Key constants are in `src/config/constants.ts`.

- `STORAGE_DIR`: `storage/` (Database, Cookies)
- `DOWNLOAD_DIR`: `downloads/`

## Development

```bash
# Run with verbose logging
bun run src/index.ts --verbose

# Run specific page range
bun run src/index.ts --page 10 --download
```

## License

MIT
