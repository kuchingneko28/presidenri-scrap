import chalk from "chalk";
import mri from "mri";
import pLimit from "p-limit";
import * as downloader from "./core/downloader";
import * as scraper from "./core/scraper";
import * as db from "./data/database";
import * as ui from "./ui/display";

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
🚀 PresidenRI Scraper (Producer-Consumer Edition)

Usage:
  bun run src/index.ts [command] [options]

Commands:
  run       Start scraping (Default)
  stats     Show database statistics

Options:
  --page, -p <n>      Start from page N (Default: 1)
  --all               Scrape all pages (Infinity)
  --update, -u        Stop after 3 empty pages (Daily Mode)
  --download, -d      Download images to disk (Default: false)
  --concurrency, -c   Download concurrency (Default: 5)
  --verbose, -v       Detailed logging
  --help, -h          Show this help
`);
  process.exit(0);
}
// --- Global Signal Handling ---
let isShuttingDown = false;

const handleExit = (signal: string) => {
  if (isShuttingDown) {
    ui.warn(`\nForce exiting...`);
    process.exit(1);
  }
  isShuttingDown = true;
  ui.stopSpinner();
  ui.warn(
    `\nReceived ${signal}. Finishing pending tasks... (Press Ctrl+C again to force exit)`,
  );
};

process.on("SIGINT", () => handleExit("SIGINT"));
process.on("SIGTERM", () => handleExit("SIGTERM"));

async function main(): Promise<void> {
  process.stdin.resume(); // Ensure the process keeps running to catch signals
  db.initDB();

  if (command === "stats") {
    const count = db.getStats();
    ui.info(`Database Stats: ${count} Articles`);
    process.exit(0);
  }

  const config = {
    startPage: Number(argv.page),
    maxPages: argv.all
      ? Infinity
      : Number(argv.page) === 1 && !argv.all && !argv.update
        ? 1
        : Number(argv.page) || 1,
    // Logic: if user says nothing, scrape page 1. If --all, scrape infinity.
    // Wait, original logic was: maxPages = argv.all ? Infinity : Number(argv.page).
    // So if page=1, max=1. Correct.
    update: Boolean(argv.update),
    download: Boolean(argv.download),
    verbose: Boolean(argv.verbose),
    concurrency: Number(argv.concurrency) || 5, // Fallback safely
  };

  if (config.update) config.maxPages = Infinity;

  ui.info(chalk.hex(ui.THEME.mauve).bold(`PresidenRI Scraper`));

  const label = (t: string) => chalk.hex(ui.THEME.lavender)(t);
  const val = (t: string | number) => chalk.hex(ui.THEME.green)(String(t));
  const bool = (b: boolean, t: string, f: string) =>
    b ? chalk.hex(ui.THEME.green)(t) : chalk.hex(ui.THEME.overlay0)(f);

  ui.log(
    `   ${label("Config:")}   Page ${val(config.startPage)} -> ${config.maxPages === Infinity ? val("End") : val(config.maxPages)}`,
  );
  ui.log(
    `   ${label("Download:")} ${bool(config.download, "ON (Concurrent)", "OFF")}`,
  );

  if (config.download) {
    ui.log(`   ${label("Threads:")}  ${val(config.concurrency)}`);
  }

  // --- Consumer Setup (Downloader) ---
  const downloadLimit = pLimit(config.concurrency);
  const downloadPromises: Promise<void>[] = [];

  // Stats tracking
  const stats = {
    page: config.startPage,
    found: 0,
    queued: 0,
    active: 0,
    downloaded: 0,
    failed: 0,
  };

  // Status Updater Loop
  const statusInterval = setInterval(() => {
    ui.initSpinner(ui.formatStatus(stats));
  }, 100);

  // Shared Headers (cached)
  let headers: Record<string, string> = await scraper.getFullHeaders();

  const handleDownload = (item: downloader.DownloadItem) => {
    if (!config.download || isShuttingDown) return;

    stats.queued++;
    // Fire and forget (tracked by downloadPromises)
    const p = downloadLimit(async () => {
      stats.queued--;
      stats.active++;
      try {
        await downloader.downloadImage(item, headers, config.verbose);
        stats.downloaded++;
      } catch (e) {
        stats.failed++;
        // Error already logged by downloader if verbose, or we can log it here
      } finally {
        stats.active--;
      }
    });
    downloadPromises.push(p);
  };

  // --- Producer Loop (Scraper) ---
  let page = config.startPage;
  let consecutiveSkips = 0;

  try {
    while (page <= config.maxPages) {
      if (isShuttingDown) break;
      stats.page = page;

      // Scrape Page
      const result = await scraper.scrapePage(
        page,
        {
          verbose: config.verbose,
          download: config.download,
        },
        handleDownload,
      );

      stats.found += result.newDownloads; // Tracking "new things related to downloads found" or just articles?
      // scrapePage returns { stop, newDownloads }
      // Let's just track found articles in stats if we want, but scraper.ts doesn't return count of articles found easily unless we change interface again.
      // Current scrapePage returns newDownloads count.

      if (result.stop) {
        ui.warn("Stopping scraper (Limit reached or Error).");
        break;
      }

      if (result.newDownloads === 0) {
        if (config.update) {
          consecutiveSkips++;
          if (consecutiveSkips >= 3) {
            ui.warn("No new images/articles for 3 pages. Catch-up complete.");
            break;
          }
        }
      } else {
        consecutiveSkips = 0;
      }

      page++;
    }
  } catch (e) {
    ui.error(`Main Loop Error: ${e}`);
  }

  // --- Cleanup ---
  clearInterval(statusInterval);
  ui.stopSpinner();

  ui.info("Scraping finished. Waiting for pending downloads...");

  if (downloadPromises.length > 0) {
    const total = downloadPromises.length;
    let finished = 0;

    // Temporary simple progress for remaining
    // Actually we can just wait all
    await Promise.all(downloadPromises);
    ui.success(`All pending downloads finished.`);
  }

  ui.success(`Run Complete.`);
  ui.log(`   Total Queued: ${downloadPromises.length}`);
  ui.log(`   Downloaded:   ${stats.downloaded}`);
  ui.log(`   Failed:       ${stats.failed}`);

  process.exit(0);
}

main();
