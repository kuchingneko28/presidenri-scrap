import path from 'node:path';
import type { PostType } from '../types';

export const BASE_URL = 'https://www.presidenri.go.id/foto/';
export const DOMAIN = 'presidenri.go.id';
export const WWW_DOMAIN = 'www.presidenri.go.id';
export const BETA_DOMAIN = 'beta.presidenri.go.id';
export const API_BASE = `https://${WWW_DOMAIN}/wp-json/wp/v2`;
export const PROJECT_ROOT = path.resolve(import.meta.dir, '../../');
export const STORAGE_DIR = path.join(PROJECT_ROOT, 'storage');
export const BROWSER_REQUEST_FILE = path.join(STORAGE_DIR, 'browser-request.curl');
export const DEFAULT_SINCE = '2024-10-20';
export const DOWNLOAD_DIR = path.join(PROJECT_ROOT, 'downloads');
export const LOGS_DIR = path.join(STORAGE_DIR, 'logs');
export const LOG_FILE = path.join(LOGS_DIR, 'scraper.log');

export const DOWNLOAD_CONCURRENCY = 5;
export const ITEM_PROCESSING_CONCURRENCY = 3;
export const DEFAULT_RETRIES = 3;
export const STREAM_TIMEOUT = 30_000;
export const FETCH_TIMEOUT = 300_000;
export const MIN_FILE_SIZE = 500;
export const BLOCK_WATCH_TIMEOUT = 300_000;
export const DESCRIPTION_MAX_LENGTH = 120;
export const SYNC_BATCH_SIZE = 100;
export const SYNC_PROGRESS_INTERVAL = 50;
export const DEFAULT_PER_PAGE = 100;
export const MEDIA_PER_PAGE = 100;
export const HTTP_BAD_REQUEST = 400;
export const HTTP_NOT_FOUND = 404;
export const NO_BODY_STATUS_CODES = [101, 204, 205, 304];
export const BACKOFF_BASE_MS = 1000;
export const SHUTDOWN_POLL_MS = 500;
export const WORLD_READABLE_FILE_BIT = 0o004;
export const PROGRESS_UPDATE_INTERVAL = 10;
export const BACKPRESSURE_MULTIPLIER = 3;
export const FALLBACK_FILENAME_PREFIX = "image_";
export const FALLBACK_EXTENSION = ".jpg";
export const TIMESTAMP_LENGTH = 19;
export const LOG_FLUSH_INTERVAL_MS = 1000;
export const MAX_FILENAME_LENGTH = 100;
export const SQL_BUSY_TIMEOUT_MS = 5000;
export const IMAGE_FILE_EXTENSION_PATTERN = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;
export const BYTES_PER_MB = 1024 * 1024;

export function getPostTypeLabel(postType: PostType, variant: "display" | "tag" = "display"): string {
  if (postType === "photo-ebook") return "E-Album";
  if (postType === "photo") return variant === "tag" ? "Foto" : "Photo";
  return postType.charAt(0).toUpperCase() + postType.slice(1);
}

