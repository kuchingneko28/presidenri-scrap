import * as cheerio from "cheerio";
import pLimit from "p-limit";
import { BASE_URL, COOKIE_FILE, YEAR_LIMIT } from "../config/constants";
import { HEADERS } from "../config/headers";
import * as db from "../data/database";
import * as ui from "../ui/display";
import { parseCookieFileContent, parseDate } from "../utils";
import { fetchWithRetry } from "../utils/network";
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
  newDownloads: number;
}

export async function scrapePage(
  pageNumber: number,
  config: { verbose?: boolean; download?: boolean },
  onDownload: (item: DownloadItem) => void,
): Promise<ScrapeResult> {
  const url = pageNumber === 1 ? BASE_URL : `${BASE_URL}page/${pageNumber}/`;

  // ui.log(`Fetching Page ${pageNumber}...`); // Verbose only? No, orchestrator handles spinner.

  const cookieHeader = await getCookies();
  const headers = { ...HEADERS, Cookie: cookieHeader };

  interface ScrapedMetadata {
    link: string;
    title: string;
    dateText: string;
  }

  let response: Response;
  try {
    response = await fetchWithRetry(url, { headers, retries: 3 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    ui.error(`Network error on Page ${pageNumber}: ${msg}`);
    return { stop: false, newDownloads: 0 };
  }

  if (!response.ok) {
    ui.error(
      `Failed to fetch page ${pageNumber}: ${response.status} ${response.statusText}`,
    );
    if (response.status === 404) return { stop: true, newDownloads: 0 };
    return { stop: false, newDownloads: 0 };
  }

  const html = await response.text();

  if (html.includes("Just a moment...")) {
    ui.error("Cloudflare detected! Update cookies.txt");
    return { stop: true, newDownloads: 0 };
  }

  const $ = cheerio.load(html);
  const articleNodes = $("article.media");

  if (articleNodes.length === 0) {
    ui.warn(`No articles found on Page ${pageNumber}.`);
    return { stop: true, newDownloads: 0 };
  }

  let newCount = 0;
  let newDownloadsCount = 0;
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
            // Queue existing images if download is enabled
            article.images.forEach((img, idx) => {
              onDownload({
                title: article.title,
                date: article.date, // might need ensuring ISO
                imageUrl: img,
                index: idx,
              });
            });
            if (article.images.length > 0) newDownloadsCount++;
            if (config.verbose) ui.info(`[EXIST] Queued: ${meta.title}`);
          }
        }
        return;
      }

      try {
        // Fetch Detail
        const detailRes = await fetchWithRetry(meta.link, { headers });

        if (!detailRes.ok) return;

        const detailHtml = await detailRes.text();
        const $d = cheerio.load(detailHtml);

        let description = $d(".excerpt").first().text().trim();
        if (!description) {
          description = $d('meta[name="description"]').attr("content") || "";
        }

        const images: string[] = [];
        const slides = $d(".flexslider .slides li");

        slides.each((_, slide) => {
          const $slide = $d(slide);

          // Strategy 1: Gallery Link (Usually HD)
          let imgUrl = $slide
            .find(".content a[data-fancybox='gallery']")
            .attr("href");

          // Strategy 2: Download Button (Fallback)
          if (!imgUrl) {
            imgUrl = $slide.find(".flex-download a").attr("href");
          }

          // Strategy 3: Original Image src extraction (Last Resort, strip size suffix)
          if (!imgUrl) {
            const src = $slide.find("img").attr("src");
            if (src) {
              // Try to strip dimension suffix e.g. image-500x500.jpg -> image.jpg
              // Regex to match -NxN.ext at end
              imgUrl = src.replace(/-\d+x\d+(\.[a-zA-Z]+)$/, "$1");
            }
          }

          if (imgUrl) images.push(imgUrl);
        });

        if (images.length > 0) {
          db.saveArticle({
            link: meta.link,
            title: meta.title,
            date: cleanDate,
            description,
            tags: [], // Tags extraction if needed
            images,
          });

          if (config.verbose)
            ui.success(`Saved: ${meta.title} (${images.length} imgs)`);

          if (config.download) {
            images.forEach((img, idx) => {
              onDownload({
                title: meta.title,
                date: cleanDate,
                imageUrl: img,
                index: idx,
              });
            });
            newDownloadsCount++;
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

  if (stopDueToDate) {
    ui.warn(`Reached year limit (< ${YEAR_LIMIT}). Stopping.`);
    return { stop: true, newDownloads: newDownloadsCount };
  }

  return { stop: false, newDownloads: newDownloadsCount };
}
