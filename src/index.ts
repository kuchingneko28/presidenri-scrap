import { cac } from "cac";
import { AppService } from "./services/AppService";
import { DEFAULT_SINCE } from "./config/constants";

const cli = cac("presidenri-scrap");
const app = new AppService();

cli
  .command("api", "Scrape using WordPress JSON API")
  .option("-d, --download", "Download images while scraping")
  .option("-v, --verbose", "Detailed logging")
  .option("-f, --force", "Ignore database check")
  .option("--per-page <n>", "Articles per API request", { default: 100 })
  .option("--filter <text>", "Only process articles containing this text")
  .option("--search <text>", "Ask the server to only return articles matching this text")
  .option("--since <date>", "Stop at this date (YYYY-MM-DD)", { default: DEFAULT_SINCE })
  .option("--before <date>", "Start from this date going backwards (YYYY-MM-DD)")
  .option("--limit <n>", "Maximum number of articles to process")
  .action(async (options) => {
    await app.runApiScraper({
      download: options.download,
      verbose: options.verbose,
      force: options.force,
      perPage: options.perPage,
      filter: options.filter,
      search: options.search,
      since: options.since,
      before: options.before,
      limit: options.limit ? parseInt(options.limit) : undefined,
    });
    app.shutdown();
    process.exit(0);
  });

cli
  .command("legacy", "Scrape using legacy HTML method")
  .option("-p, --page <n>", "Start from page N", { default: 1 })
  .option("-d, --download", "Download images while scraping")
  .option("-v, --verbose", "Detailed logging")
  .option("-u, --update", "Stop after 3 pages with no new articles")
  .option("--all", "Continue until the limit")
  .option("--filter <text>", "Only process articles containing this text")
  .option("--since <date>", "Stop at this date (YYYY-MM-DD)", { default: DEFAULT_SINCE })
  .option("--limit <n>", "Maximum number of articles to process")
  .action(async (options) => {
    await app.runLegacyScraper({
      startPage: options.page,
      download: options.download,
      verbose: options.verbose,
      stopAfterEmptyPages: options.update ? 3 : 0,
      filter: options.filter,
      since: options.since,
      limit: options.limit ? parseInt(options.limit) : undefined,
    });
    app.shutdown();
    process.exit(0);
  });

cli.command("request", "Create storage/browser-request.curl if needed").action(async () => {
  await app.initRequestFile();
  app.shutdown();
  process.exit(0);
});

cli.command("stats", "Show database article count").action(() => {
  app.showStats();
  app.shutdown();
  process.exit(0);
});

cli
  .command("sync", "Download missing images from database without scraping")
  .option("-v, --verbose", "Detailed logging")
  .option("--filter <text>", "Only process articles containing this text")
  .option("--limit <n>", "Maximum number of articles to process")
  .action(async (options) => {
    await app.syncDownloads({ 
      verbose: options.verbose,
      filter: options.filter,
      limit: options.limit ? parseInt(options.limit) : undefined,
    });
    app.shutdown();
    process.exit(0);
  });

cli.help();
cli.parse();
