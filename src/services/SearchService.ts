import type { DatabaseService } from "./DatabaseService";
import type { LoggerService } from "./LoggerService";
import type { SearchOptions } from "../types";
import { DESCRIPTION_MAX_LENGTH } from "../config/constants";

export class SearchService {
  constructor(
    private db: DatabaseService,
    private logger: LoggerService,
  ) {}

  search(queryText: string, options: SearchOptions): void {
    this.logger.startSpinner("Searching articles...");
    const results = this.db.searchArticles(queryText, options);
    this.logger.stopSpinner();
    if (options.json) {
      this.logger.log(JSON.stringify(results, null, 2));
      return;
    }

    if (results.length === 0) {
      this.logger.info("No articles found matching the search criteria.");
      return;
    }

    this.logger.success(`Found ${results.length} matching articles:\n`);
    for (const article of results) {
      const tags = article.tags.length > 0 ? ` (${article.tags.join(", ")})` : "";
      this.logger.info(`[${article.date}] ${article.title}${tags} — ${article.images.length} images`);
      if (article.description) {
        const desc =
          article.description.length > DESCRIPTION_MAX_LENGTH
            ? article.description.substring(0, DESCRIPTION_MAX_LENGTH) + "..."
            : article.description;
        this.logger.info(`  ${desc}`);
      }
      this.logger.info(`  Link: ${article.link}\n`);
    }
  }
}
