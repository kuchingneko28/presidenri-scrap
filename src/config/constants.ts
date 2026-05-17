import path from 'node:path';

export const BASE_URL = 'https://www.presidenri.go.id/foto/';
export const PROJECT_ROOT = path.resolve(import.meta.dir, '../../');
export const STORAGE_DIR = path.join(PROJECT_ROOT, 'storage');
export const DEBUG_HTML_DIR = path.join(STORAGE_DIR, 'debug-html');
export const BROWSER_REQUEST_FILE = path.join(STORAGE_DIR, 'browser-request.curl');
export const DEFAULT_SINCE = '2024-10-20';
export const DOWNLOAD_DIR = path.join(PROJECT_ROOT, 'downloads');
