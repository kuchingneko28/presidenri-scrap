import fs from "node:fs/promises";
import path from "node:path";
import { DOWNLOAD_DIR } from "../config/constants";
import * as ui from "../ui/display";
import { sanitize } from "../utils";
import { fetchWithRetry } from "../utils/network";

export interface DownloadItem {
  title: string;
  date: string; // YYYY-MM-DD or ISO
  imageUrl: string;
  index: number;
}

export async function downloadImage(
  item: DownloadItem,
  headers: Record<string, string>,
  verbose: boolean,
): Promise<void> {
  try {
    const dateObj = new Date(item.date);
    const dateStr = item.date.split("T")[0]; // Ensure YYYY-MM-DD
    const safeTitle = sanitize(item.title);

    // New Folder Structure: downloads/YYYY-MM-DD - Title/
    const folderName = `${dateStr} - ${safeTitle}`;
    const folderPath = path.join(DOWNLOAD_DIR, folderName);

    await fs.mkdir(folderPath, { recursive: true });

    const namePart = item.imageUrl.split("/").pop();
    const filename = namePart || `image-${item.index}.jpg`;
    const cleanFilename = filename.split("?")[0] || filename;
    const filePath = path.join(folderPath, cleanFilename);

    // Check existence
    if (await fs.exists(filePath)) {
      // if (verbose) ui.log(`[SKIP] ${cleanFilename}`);
      return;
    }

    if (verbose) ui.log(`[GET] ${item.imageUrl}`);

    const response = await fetchWithRetry(item.imageUrl, {
      headers,
      timeout: 60000,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(filePath, Buffer.from(arrayBuffer));

    // Metadata Preservation
    const lastModifiedHeader = response.headers.get("last-modified");
    let mtime = new Date(item.date); // Default to Article Date

    if (lastModifiedHeader) {
      const serverDate = new Date(lastModifiedHeader);
      if (!isNaN(serverDate.getTime())) {
        mtime = serverDate;
      }
    }

    // Set Access Time and Modified Time
    // fs.utimes accepts (path, atime, mtime)
    await fs.utimes(filePath, new Date(), mtime);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    ui.error(`Failed ${item.imageUrl}: ${msg}`);
    throw e; // Propagate to caller (p-queue) so it counts as failure/retry
  }
}
