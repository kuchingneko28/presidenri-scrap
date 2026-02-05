import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { BASE_URL, COOKIE_FILE, YEAR_LIMIT } from "../config/constants";
import { HEADERS } from "../config/headers";
import * as db from "../data/database";
import * as ui from "../ui/display";
import { parseCookieFileContent, parseDate } from "../utils";
import type { DownloadItem } from "./downloader";

export function getHeaders(): Record<string, string> {
  return { ...HEADERS };
}

export async function getFullHeaders(): Promise<Record<string, string>> {
  const cookieHeader = await getCookies();
  return { ...HEADERS, Cookie: cookieHeader };
}

async function getCookies(): Promise<string> {
  const f = Bun.file(COOKIE_FILE);
  if (await f.exists()) {
    const text = await f.text();
    return parseCookieFileContent(text);
  }
  return "";
}

interface ScrapeResult {
  stop: boolean;
  count: number;
  downloads: DownloadItem[];
}

export async function scrapePage(
  pageNumber: number,
  config: { verbose?: boolean; download?: boolean },
): Promise<ScrapeResult> {
  const url = pageNumber === 1 ? BASE_URL : `${BASE_URL}page/${pageNumber}/`;
  ui.startSpinner(`Fetching Page ${pageNumber}`);

  const cookieHeader = await getCookies();
  const headers = { ...HEADERS, Cookie: cookieHeader };

  interface ScrapedMetadata {
    link: string;
    title: string;
    dateText: string;
  }

  let response: Response;
  try {
    response = await fetch(url, { headers });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    ui.error(`Network error: ${msg}`);
    return { stop: false, count: 0, downloads: [] };
  }

  if (!response.ok) {
    ui.error(`Failed to fetch page ${pageNumber}: ${response.status} ${response.statusText}`);
    if (response.status === 404) return { stop: true, count: 0, downloads: [] };
    return { stop: false, count: 0, downloads: [] };
  }

  const html = await response.text();

  if (html.includes("Just a moment...")) {
    ui.failSpinner("Cloudflare detected! Update cookies.txt");
    return { stop: true, count: 0, downloads: [] };
  }

  const $ = cheerio.load(html);
  const articleNodes = $("article.media");

  if (articleNodes.length === 0) {
    ui.warn("No articles found on this page.");
    return { stop: true, count: 0, downloads: [] };
  }

  let newCount = 0;
  const downloads: DownloadItem[] = [];
  const potentialArticles: ScrapedMetadata[] = [];
  let stopDueToDate = false;

  // Pre-parse list
  articleNodes.each((_, el) => {
    const link = $(el).find(".title a").attr("href");
    const title = $(el).find(".title a").text().trim();
    const dateText = $(el)
      .find(".datetime")
      .text()
      .replace(/\d+ Foto/, "")
      .trim();

    if (link && title && dateText) {
      potentialArticles.push({ link, title, dateText });
    }
  });

  ui.updateSpinner(`Processing ${potentialArticles.length} items on Page ${pageNumber}...`);

  // Deep parse
  const limit = pLimit(5);
  const tasks = potentialArticles.map((meta) =>
    limit(async () => {
      if (stopDueToDate) return;

      const cleanDate = parseDate(meta.dateText);

      // Date Limit Check
      if (cleanDate) {
        const year = new Date(cleanDate).getFullYear();
        if (year < YEAR_LIMIT) {
          stopDueToDate = true;
          return;
        }
      } else {
        ui.warn(`Could not parse date for ${meta.title} (${meta.dateText})`);
        return;
      }

      // Check existence
      if (db.articleExists(meta.link)) {
        if (config.download) {
          const article = db.getArticle(meta.link);
          if (article && article.images && article.images.length > 0) {
            if (config.verbose) ui.info(`[EXIST] Queuing download: ${meta.title}`);

            // Parse date from DB if it's not already ISO
            // The DB might contain raw strings from legacy scraper
            const dateStr = parseDate(article.date) || article.date;

            downloads.push({
              title: article.title,
              date: dateStr,
              images: article.images,
            });
          }
        }
        return;
      }

      try {
        // Fetch Detail
        const detailRes = await fetch(meta.link, { headers });

        if (!detailRes.ok) return;

        const detailHtml = await detailRes.text();
        const $d = cheerio.load(detailHtml);

        let description = $d(".excerpt").first().text().trim();
        if (!description) {
          description = $d('meta[name="description"]').attr("content") || "";
        }

        const images: string[] = [];
        $d('.flexslider .slides li .content a[data-fancybox="gallery"]').each((_, e) => {
          const imgUrl = $d(e).attr("href");
          if (imgUrl) images.push(imgUrl);
        });

        if (images.length > 0) {
          db.saveArticle({
            link: meta.link,
            title: meta.title,
            date: cleanDate,
            description,
            tags: [],
            images,
          });

          if (config.verbose) ui.success(`Saved: ${meta.title} (${images.length} imgs)`);

          if (config.download) {
            downloads.push({
              title: meta.title,
              date: cleanDate,
              images,
            });
          }

          newCount++;
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        ui.error(`Failed to parse ${meta.link}: ${msg}`);
      }
    }),
  );

  await Promise.all(tasks);

  ui.stopSpinner("✔", `Page ${pageNumber}: ${newCount} new articles.`);

  if (stopDueToDate) {
    ui.warn(`Reached year limit (< ${YEAR_LIMIT}). Stopping.`);
    return { stop: true, count: newCount, downloads };
  }

  return { stop: false, count: newCount, downloads };
}
