# PresidenRI Scraper

A high-performance, modular web scraper for [presidenri.go.id/foto/](https://www.presidenri.go.id/foto/) built with Bun and TypeScript.

## Features

- **Modular Architecture**: Built using a procedural approach for maximum maintainability and clarity.
- **Type Safety**: Fully implemented in TypeScript with strict type checking and no `any` types.
- **Concurrent Processing**: Optimized for speed using concurrent scraping and image downloading via `p-limit`.
- **Smart Data Handling**: Reuses existing SQLite databases to skip redundant downloads and save processing time.
- **Real-time Feedback**: Detailed CLI progress indicators and logging for monitoring long-running tasks.
- **Custom Image Logic**: Organizes downloads into year/month-based directory structures while handling complex URL patterns.
- **Verification Suite**: Includes a comprehensive unit test suite covering all core modules and utilities.

## Technology Stack

- **Runtime**: [Bun](https://bun.sh/)
- **Data Layer**: Bun SQLite
- **Parsing**: Cheerio
- **CLI Utilities**: Ora, Chalk, mri

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) installed on your system.
- A `cookies.txt` file in the root directory (optional, used for bypassing security layers).

### Installation

```bash
bun install
```

### Usage

```bash
# Basic execution (Scrape metadata)
bun run index.ts

# Full execution (Scrape and download images)
bun run index.ts --download

# Scrape all pages with date limits (Stops at 2018)
bun run index.ts --all --download

# Update mode (Stops after 3 empty pages)
bun run index.ts --update --download

# View database statistics
bun run index.ts stats
```

## Testing

The project includes a full unit test suite using `bun:test`.

```bash
bun test
```

## Project Structure

- `src/config/`: Configuration and HTTP header templates.
- `src/core/`: Primary scraping and downloading logic.
- `src/data/`: Database management and article schema.
- `src/ui/`: CLI display and progress modules.
- `src/utils/`: Specialized date parsing and string utilities.
- `tests/`: Module-level unit tests.
