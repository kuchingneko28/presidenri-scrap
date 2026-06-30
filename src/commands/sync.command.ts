import type { CAC } from "cac";
import type { AppService } from "../services/AppService";
import { validatePositiveInteger } from "../utils";

export function registerSyncCommand(cli: CAC, app: AppService): void {
  cli
    .command("sync", "Download missing images from database without scraping")
    .option("-v, --verbose", "Detailed logging")
    .option("--filter <text>", "Only process articles containing this text")
    .option("--limit <n>", "Maximum number of articles to process")
    .action(async (options) => {
      try {
        const limit = validatePositiveInteger(options.limit, "limit");
        await app.syncDownloads({
          verbose: options.verbose,
          filter: options.filter,
          limit,
        });
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
      app.shutdown();
      process.exit(0);
    });
}
