import path from "node:path";

export const PROJECT_ROOT = path.resolve(import.meta.dir, "..");
export const STORAGE_DIR = path.join(PROJECT_ROOT, "storage");
export const DOWNLOADS_DIR = path.join(PROJECT_ROOT, "downloads");
export const DB_PATH = path.join(STORAGE_DIR, "data.db");
export const BROWSER_REQUEST_FILE = path.join(STORAGE_DIR, "browser-request.curl");

export const DOMAIN = "presidenri.go.id";
export const WWW_DOMAIN = "www.presidenri.go.id";
export const BETA_DOMAIN = "beta.presidenri.go.id";
export const API_BASE = `https://${WWW_DOMAIN}/wp-json/wp/v2`;

export const DEFAULT_SINCE = "2024-10-20";
export const DEFAULT_PER_PAGE = 100;
export const MEDIA_PER_PAGE = 100;
export const DOWNLOAD_CONCURRENCY = 5;
export const DEFAULT_RETRIES = 3;
export const BACKOFF_BASE_MS = 1000;
export const BLOCK_WATCH_TIMEOUT = 300_000;
export const MIN_FILE_SIZE = 500;

export const DEFAULT_HEADERS: Record<string, string> = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "no-cache",
  DNT: "1",
  Referer: `https://${WWW_DOMAIN}/`,
  "Sec-GPC": "1",
  "Upgrade-Insecure-Requests": "1",
  "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
};

export const IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;
