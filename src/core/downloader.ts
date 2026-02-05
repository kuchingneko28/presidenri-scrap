import fs from "node:fs/promises";
import pLimit from "p-limit";
import * as ui from "../ui/display";
import { sanitize } from "../utils";

const DOWNLOAD_DIR = "downloads";

export interface DownloadItem {
  title: string;
  date: string;
  images: string[];
}

export async function processDownloadQueue(
  queue: DownloadItem[],
  concurrency: number = 5,
  verbose: boolean = false,
  headers: Record<string, string>,
): Promise<void> {
  const limit = pLimit(concurrency);
  const tasks: Promise<void>[] = [];

  /* Existing code lines 24-26 */
  const totalImages = queue.reduce((a, b) => a + b.images.length, 0);
  ui.info(`Processing ${queue.length} articles (${totalImages} images)...`);

  let completed = 0;
  ui.startSpinner(`Downloading images [0/${totalImages}]...`);

  for (const item of queue) {
    const dateObj = new Date(item.date);
    const year = dateObj.getFullYear();
    const month = (dateObj.getMonth() + 1).toString().padStart(2, "0");
    const safeTitle = sanitize(item.title);

    const folderPath = `${DOWNLOAD_DIR}/${year}/${month} - ${safeTitle}`;

    item.images.forEach((url, index) => {
      tasks.push(
        limit(async () => {
          await downloadItem(url, folderPath, index, verbose, headers);
          completed++;
          ui.updateSpinner(`Downloading images [${completed}/${totalImages}]...`);
        }),
      );
    });
  }

  await Promise.all(tasks);
  ui.stopSpinner("✔", `Downloads completed (${completed}/${totalImages}).`);
}

async function downloadItem(
  url: string,
  folder: string,
  index: number,
  verbose: boolean,
  headers: Record<string, string>,
): Promise<void> {
  try {
    await fs.mkdir(folder, { recursive: true });

    const filename = url.split("/").pop() || `image-${index}.jpg`;
    const cleanFilename = filename.split("?")[0];
    const filePath = `${folder}/${cleanFilename}`;

    try {
      await fs.stat(filePath);
      if (verbose) ui.log(`   [SKIP] Exists: ${cleanFilename}`);
      return;
    } catch (e) {
      // File does not exist, proceed
    }

    if (verbose) ui.log(`   [GET] ${url}`);

    // Add 30s timeout
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });
      clearTimeout(id);

      if (!response.ok) {
        ui.error(`Download failed ${url}: ${response.status} ${response.statusText}`);
        return;
      }

      const arrayBuffer = await response.arrayBuffer();
      await fs.writeFile(filePath, Buffer.from(arrayBuffer));
    } catch (e: unknown) {
      clearTimeout(id);
      throw e;
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    ui.error(`Download error ${url}: ${msg}`);
  }
}
