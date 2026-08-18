import { cac } from "cac";
import { intro, outro, spinner, log } from "@clack/prompts";
import { existsSync, readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { ArticleRepository } from "./storage/db";
import { PresidenClient } from "./api/client";
import { Downloader } from "./downloader";
import { BROWSER_REQUEST_FILE, DEFAULT_SINCE, DOWNLOADS_DIR, DOWNLOAD_CONCURRENCY, IMAGE_EXTENSIONS } from "./config";
import type { ScrapeOptions, SearchOptions } from "./types";
import pkg from "../package.json";

const cli = cac("presidenri");
cli.version(pkg.version);

// -------------------------------------------------------------
// Command: Scrape (Default)
// -------------------------------------------------------------
cli
  .command("[...root]", "Scrape articles and photos via WordPress REST API")
  .option("-d, --download", "Download full-resolution images")
  .option("-c, --concurrency <n>", "Concurrent photo downloads", { default: DOWNLOAD_CONCURRENCY })
  .option("-f, --force", "Re-process articles even if already up to date in DB")
  .option("--since <date>", "Stop at this publication date (YYYY-MM-DD)", { default: DEFAULT_SINCE })
  .option("--before <date>", "Scrape backwards from this date (YYYY-MM-DD or YYYY)")
  .option("--limit <n>", "Limit maximum number of articles to process")
  .option("--filter <text>", "Local text filter on article title/description")
  .option("--search <text>", "Server-side search query on WordPress API")
  .option("--type <type>", "WordPress post type (photo, photo-ebook, etc.)", { default: "photo" })
  .option("--dry-run", "Simulate operations without saving to DB or disk")
  .option("-v, --verbose", "Enable detailed verbose logging")
  .action(async (_rootArgs, options) => {
    intro("PresidenRI Photo Scraper");
    const startTime = performance.now();

    const db = new ArticleRepository();
    const client = new PresidenClient();
    const concurrency = options.concurrency ? Math.max(1, Number(options.concurrency)) : DOWNLOAD_CONCURRENCY;
    const downloader = new Downloader(client, concurrency);

    const isVerbose = Boolean(options.verbose);
    const spin = isVerbose ? null : spinner();
    if (spin) spin.start("Connecting to PresidenRI API...");

    const scrapeOptions: ScrapeOptions = {
      download: options.download,
      force: options.force,
      since: options.since,
      before: options.before,
      limit: options.limit ? Number(options.limit) : undefined,
      filter: options.filter,
      search: options.search,
      type: options.type,
      dryRun: options.dryRun,
      verbose: isVerbose,
    };

    let processedCount = 0;
    let newSavedCount = 0;

    const handleExit = () => {
      if (spin) spin.stop("Aborted");
      db.close();
      process.exit(0);
    };
    process.once("SIGINT", handleExit);
    process.once("SIGTERM", handleExit);

    try {
      for await (const article of client.streamArticles(scrapeOptions)) {
        processedCount++;

        const existingModified = article.postId ? db.getModified(article.postId) : null;
        const isUpToDate = existingModified && existingModified === article.modified;

        if (!scrapeOptions.force && isUpToDate) {
          if (scrapeOptions.download && article.images.length > 0) {
            if (isVerbose) {
              log.info(`[Cached Album] ${article.title} (${article.images.length} photos)`);
            }
            const albumTasks = article.images.map((imgUrl, i) =>
              downloader.download(
                { title: article.title, date: article.date, imageUrl: imgUrl, index: i, postUrl: article.link },
                isVerbose,
                scrapeOptions.dryRun
              )
            );
            await Promise.all(albumTasks);
          } else if (isVerbose) {
            log.info(`[Cached] ${article.title}`);
          }

          if (spin) {
            spin.message(`Checked: ${processedCount} (${newSavedCount} new saved)`);
          }
          continue;
        }

        if (!scrapeOptions.dryRun) {
          db.save(article);
        }
        newSavedCount++;

        if (isVerbose) {
          log.success(`[Album ${processedCount}] ${article.title} (${article.images.length} photos)`);
        }

        if (scrapeOptions.download && article.images.length > 0) {
          if (spin) {
            spin.message(`[${processedCount}] Downloading ${article.images.length} photos: ${article.title.slice(0, 40)}...`);
          }

          const albumTasks = article.images.map((imgUrl, i) =>
            downloader.download(
              { title: article.title, date: article.date, imageUrl: imgUrl, index: i, postUrl: article.link },
              isVerbose,
              scrapeOptions.dryRun
            )
          );
          await Promise.all(albumTasks);
        }

        if (spin) {
          const dlStats = downloader.getStats();
          const mb = (dlStats.bytes / (1024 * 1024)).toFixed(1);
          spin.message(
            `Scraped: ${newSavedCount} new | DL: ${dlStats.downloaded} done, ${dlStats.skipped} skipped (${mb} MB)`
          );
        }
      }

      const dlStats = downloader.getStats();
      const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

      if (spin) spin.stop("Scraping completed!");

      log.success(`Scraped: ${newSavedCount} new/updated articles (${processedCount} checked) in ${elapsed}s.`);
      if (scrapeOptions.download) {
        log.info(
          `Downloads: ${dlStats.downloaded} downloaded, ${dlStats.skipped} skipped, ${dlStats.failed} failed (${(dlStats.bytes / (1024 * 1024)).toFixed(1)} MB).`
        );
      }
    } catch (error) {
      if (spin) spin.stop("Scraping stopped");
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    } finally {
      db.close();
    }

    outro("Done!");
  });

// -------------------------------------------------------------
// Command: Sync (Download missing images for DB articles)
// -------------------------------------------------------------
cli
  .command("sync", "Download missing photos for all articles currently stored in SQLite")
  .option("-c, --concurrency <n>", "Concurrent photo downloads", { default: DOWNLOAD_CONCURRENCY })
  .option("--since <date>", "Only sync articles published on or after this date (YYYY-MM-DD)")
  .option("--limit <n>", "Limit maximum number of articles to sync")
  .option("-v, --verbose", "Enable detailed verbose logging")
  .option("--dry-run", "Simulate downloads without writing files")
  .action(async (options) => {
    intro("PresidenRI Photo Sync");
    const startTime = performance.now();

    const db = new ArticleRepository();
    const client = new PresidenClient();
    const concurrency = options.concurrency ? Math.max(1, Number(options.concurrency)) : DOWNLOAD_CONCURRENCY;
    const downloader = new Downloader(client, concurrency);

    const isVerbose = Boolean(options.verbose);
    const spin = isVerbose ? null : spinner();
    if (spin) spin.start("Loading articles from database...");

    const articles = db.getAll({
      since: options.since,
      limit: options.limit ? Number(options.limit) : undefined,
    });

    if (spin) spin.message(`Found ${articles.length} articles in database. Checking downloads...`);

    let articleIndex = 0;
    for (const article of articles) {
      articleIndex++;
      if (isVerbose) {
        log.info(`[Sync Album ${articleIndex}/${articles.length}] ${article.title} (${article.images.length} photos)`);
      }

      if (spin) {
        spin.message(`[${articleIndex}/${articles.length}] Syncing: ${article.title.slice(0, 40)}...`);
      }

      const albumTasks = article.images.map((imgUrl, i) =>
        downloader.download(
          { title: article.title, date: article.date, imageUrl: imgUrl, index: i, postUrl: article.link },
          isVerbose,
          options.dryRun
        )
      );
      await Promise.all(albumTasks);
    }

    const dlStats = downloader.getStats();
    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);

    if (spin) spin.stop("Sync completed!");

    log.info(
      `Results: ${dlStats.downloaded} downloaded, ${dlStats.skipped} already on disk, ${dlStats.failed} failed (${(dlStats.bytes / (1024 * 1024)).toFixed(1)} MB) in ${elapsed}s.`
    );
    db.close();
    outro("Done!");
  });

// -------------------------------------------------------------
// Command: Search
// -------------------------------------------------------------
cli
  .command("search <query>", "Search stored articles in local SQLite database")
  .option("-l, --limit <n>", "Limit results count", { default: 10 })
  .option("-t, --tag <tag>", "Filter by category/tag")
  .option("--json", "Output results as JSON")
  .action((query, options: SearchOptions) => {
    const db = new ArticleRepository();
    const results = db.search(query, { limit: options.limit ? Number(options.limit) : 10, tag: options.tag });

    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      intro(`Search results for "${query}" (${results.length} found)`);
      for (const item of results) {
        log.info(`[${item.date}] ${item.title}`);
        log.message(`  Link: ${item.link}`);
        log.message(`  Images: ${item.images.length} photo(s)\n`);
      }
      outro(`End of results`);
    }
    db.close();
  });

// -------------------------------------------------------------
// Command: Stats
// -------------------------------------------------------------
cli.command("stats", "Display database and downloaded photo statistics").action(() => {
  const db = new ArticleRepository();
  const stats = db.getStats();

  let diskCount = 0;
  if (existsSync(DOWNLOADS_DIR)) {
    for (const entry of readdirSync(DOWNLOADS_DIR, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        const folder = `${DOWNLOADS_DIR}/${entry.name}`;
        for (const file of readdirSync(folder)) {
          if (IMAGE_EXTENSIONS.test(file)) diskCount++;
        }
      }
    }
  }

  intro("PresidenRI Statistics");
  log.info(`Articles in database: ${stats.totalArticles}`);
  log.info(`Articles with photos: ${stats.articlesWithImages}`);
  log.info(`Total photo URLs in DB: ${stats.totalImages}`);
  log.info(`Downloaded photos on disk: ${diskCount}`);

  if (stats.totalImages > 0) {
    const pct = Math.round((diskCount / stats.totalImages) * 100);
    log.info(`Download coverage: ${pct}%`);
  }

  db.close();
  outro("Done!");
});

// -------------------------------------------------------------
// Command: Auth
// -------------------------------------------------------------
cli.command("auth", "Initialize or check browser-request.curl for Cloudflare credentials").action(async () => {
  intro("PresidenRI Authentication Setup");

  if (!existsSync(BROWSER_REQUEST_FILE)) {
    await writeFile(
      BROWSER_REQUEST_FILE,
      `# Paste your browser curl command here\n# Right click request in DevTools -> Copy as cURL\n`
    );
    log.success(`Created: ${BROWSER_REQUEST_FILE}`);
    log.info("Please paste your browser cURL command into that file.");
  } else {
    log.info(`Config file exists: ${BROWSER_REQUEST_FILE}`);
  }

  outro("Ready!");
});

cli.help();
cli.parse();
