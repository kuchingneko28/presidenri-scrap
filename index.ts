import mri from "mri";
import * as downloader from "./src/core/downloader";
import * as scraper from "./src/core/scraper";
import * as db from "./src/data/database";
import * as ui from "./src/ui/display";

const argv = mri(Bun.argv.slice(2), {
  boolean: ["help", "update", "verbose", "download"],
  alias: {
    h: "help",
    u: "update",
    v: "verbose",
    d: "download",
    p: "page",
    c: "concurrency",
  },
  default: {
    page: 1,
    concurrency: 5,
  },
});

const command = argv._[0] || "run";

if (argv.help) {
  console.log(`
🚀 PresidenRI Scraper (Bun Edition - Procedural)

Usage:
  bun run index.ts [command] [options]

Commands:
  run       Start scraping (Default)
  stats     Show database statistics

Options:
  --page, -p <n>      Start from page N (Default: 1)
  --all               Scrape all pages (Infinity) -> Use --page 1 --all
  --update, -u        Stop after 3 empty pages (Daily Mode)
  --download, -d      Download images to disk
  --verbose, -v       Detailed logging
  --help, -h          Show this help
`);
  process.exit(0);
}

async function main(): Promise<void> {
  // 1. Init DB
  db.initDB();

  if (command === "stats") {
    const count = db.getStats();
    ui.info(`Database Stats: ${count} Articles`);
    process.exit(0);
  }

  // Default: RUN
  const config = {
    startPage: Number(argv.page),
    maxPages: argv.all ? Infinity : Number(argv.page),
    update: Boolean(argv.update),
    download: Boolean(argv.download),
    verbose: Boolean(argv.verbose),
    concurrency: Number(argv.concurrency),
  };

  if (config.update) config.maxPages = Infinity;

  ui.info(`PresidenRI Scraper`);
  ui.log(`   Command: ${command}`);
  ui.log(`   Start:   Page ${config.startPage}`);
  ui.log(`   Max:     ${config.maxPages === Infinity ? "Unlimited" : config.maxPages}`);
  ui.log(`   Update:  ${config.update ? "On" : "Off"}`);
  ui.log(`   Images:  ${config.download ? "Download Enabled" : "Skip"}`);
  if (config.verbose) ui.log(`   Verbose: On`);

  let page = config.startPage;
  let consecutiveSkips = 0;
  let allDownloads: downloader.DownloadItem[] = [];

  while (page <= config.maxPages) {
    // 2. Scrape Page
    const result = await scraper.scrapePage(page, {
      verbose: config.verbose,
      download: config.download,
    });

    if (config.download && result.downloads.length > 0) {
      allDownloads.push(...result.downloads);
    }

    if (result.stop) {
      ui.warn("Stopping scraper (Limit reached or Error).");
      break;
    }

    if (result.count === 0) {
      // Only count consecutively if NOT stopped (though stop usually implies count=0 too, except date limit)
      if (config.update) {
        consecutiveSkips++;
        if (consecutiveSkips >= 3) {
          ui.warn("No new articles found for 3 pages. Catch-up complete.");
          break;
        }
      }
    } else {
      consecutiveSkips = 0;
    }

    page++;
  }

  // 3. Process Downloads
  if (config.download && allDownloads.length > 0) {
    ui.info("Starting download queue...");
    const headers = await scraper.getFullHeaders(); // Get headers WITH cookies
    await downloader.processDownloadQueue(allDownloads, config.concurrency, config.verbose, headers);
  }

  ui.success("Scraping finished.");
  process.exit(0);
}

main();
