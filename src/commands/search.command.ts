import type { CAC } from "cac";
import type { AppService } from "../services/AppService";
import { validatePositiveInteger, validateNonNegativeInteger } from "../utils";

export function registerSearchCommand(cli: CAC, app: AppService): void {
  cli
    .command("search [query]", "Search articles in the database")
    .option("--limit <n>", "Limit the number of results", { default: 10 })
    .option("--offset <n>", "Offset for pagination", { default: 0 })
    .option("--tag <tag>", "Filter by tag (e.g., Foto, E-Album)")
    .option("--json", "Output results as JSON")
    .action((query, options) => app.runAndExit(async () => {
      const limit = validatePositiveInteger(options.limit, "limit");
      const offset = validateNonNegativeInteger(options.offset, "offset");

      app.searchArticles(query || "", {
        limit,
        offset,
        tag: options.tag,
        json: options.json,
      });
    }));
}
