import path from 'node:path';

export const BASE_URL = 'https://www.presidenri.go.id/foto/';
export const DOMAIN = 'presidenri.go.id';
export const WWW_DOMAIN = 'www.presidenri.go.id';
export const BETA_DOMAIN = 'beta.presidenri.go.id';
export const API_BASE = `https://${WWW_DOMAIN}/wp-json/wp/v2`;
export const PROJECT_ROOT = path.resolve(import.meta.dir, '../../');
export const STORAGE_DIR = path.join(PROJECT_ROOT, 'storage');
export const DEBUG_HTML_DIR = path.join(STORAGE_DIR, 'debug-html');
export const BROWSER_REQUEST_FILE = path.join(STORAGE_DIR, 'browser-request.curl');
export const DEFAULT_SINCE = '2024-10-20';
export const DOWNLOAD_DIR = path.join(PROJECT_ROOT, 'downloads');
export const LOGS_DIR = path.join(STORAGE_DIR, 'logs');
export const LOG_FILE = path.join(LOGS_DIR, 'scraper.log');

export const DOWNLOAD_CONCURRENCY = 5;
export const DEFAULT_RETRIES = 3;
export const STREAM_TIMEOUT = 30_000;
export const MIN_FILE_SIZE = 500;
export const POLL_INTERVAL = 200;

