import type { CAC } from "cac";
import type { AppService } from "../services/AppService";
import { DEFAULT_SINCE } from "../config/constants";
import { validatePositiveInteger, validateNonNegativeInteger, validateDateFormat } from "../utils";

export function registerApiCommand(cli: CAC, app: AppService): void {
  cli
    .command("api", "Scrape using WordPress JSON API")
    .option("-d, --download", "Download images while scraping")
    .option("-v, --verbose", "Detailed logging")
    .option("-f, --force", "Ignore database check")
    .option("--per-page <n>", "Articles per API request", { default: 100 })
    .option("--filter <text>", "Only process articles containing this text")
    .option(
      "--search <text>",
      "Ask the server to only return articles matching this text",
    )
    .option("--since <date>", "Stop at this date (YYYY-MM-DD)", {
      default: DEFAULT_SINCE,
    })
    .option(
      "--before <date>",
      "Start from this date going backwards (YYYY-MM-DD)",
    )
    .option("--limit <n>", "Maximum number of articles to process")
    .option("--dry-run", "Simulate run without writing to database or downloads")
    .option("--type <type>", "WordPress post type to scrape (e.g., photo, photo-ebook)", { default: "photo" })
    .option("--page-delay <ms>", "Delay between pages in milliseconds (rate limiting)", { default: 0 })
    .action((options) => app.runAndExit(async () => {
      const perPage = validatePositiveInteger(options.perPage, "per-page");
      const since = validateDateFormat(options.since, "since");
      const before = validateDateFormat(options.before, "before");
      const limit = validatePositiveInteger(options.limit, "limit");
      const pageDelay = validateNonNegativeInteger(options.pageDelay, "page-delay");

      await app.runApiScraper({
        download: options.download,
        verbose: options.verbose,
        force: options.force,
        perPage,
        filter: options.filter,
        search: options.search,
        since,
        before,
        limit,
        dryRun: options.dryRun,
        postType: options.type,
        pageDelay,
      });
    }));
}
