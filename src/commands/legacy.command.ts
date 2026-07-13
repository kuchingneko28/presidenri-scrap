import type { CAC } from "cac";
import type { AppService } from "../services/AppService";
import { DEFAULT_SINCE } from "../config/constants";
import { validatePositiveInteger, validateDateFormat } from "../utils";

export function registerLegacyCommand(cli: CAC, app: AppService): void {
  cli
    .command("legacy", "Scrape using legacy HTML method")
    .option("-p, --page <n>", "Start from page N", { default: 1 })
    .option("-d, --download", "Download images while scraping")
    .option("-v, --verbose", "Detailed logging")
    .option("-u, --update", "Stop after 3 pages with no new articles")
    .option("--all", "Continue until the limit")
    .option("-f, --force", "Re-process existing articles (re-fetch and re-download)")
    .option("--filter <text>", "Only process articles containing this text")
    .option("--since <date>", "Stop at this date (YYYY-MM-DD)", {
      default: DEFAULT_SINCE,
    })
    .option("--limit <n>", "Maximum number of articles to process")
    .option("--dry-run", "Simulate run without writing to database or downloads")
    .action((options) => app.runAndExit(async () => {
      const startPage = validatePositiveInteger(options.page, "page");
      const since = validateDateFormat(options.since, "since");
      const limit = validatePositiveInteger(options.limit, "limit");

      await app.runLegacyScraper({
        startPage,
        download: options.download,
        verbose: options.verbose,
        force: options.force,
        stopAfterEmptyPages: options.update ? 3 : 0,
        all: options.all,
        filter: options.filter,
        since,
        limit,
        dryRun: options.dryRun,
      });
    }));
}
