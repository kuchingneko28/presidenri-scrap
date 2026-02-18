import path from "node:path";

export const BASE_URL = "https://www.presidenri.go.id/foto/";
// import.meta.dir is .../src/config
export const PROJECT_ROOT = path.resolve(import.meta.dir, "../../");
export const STORAGE_DIR = path.join(PROJECT_ROOT, "storage");
export const COOKIE_FILE = path.join(STORAGE_DIR, "cookies.txt");
export const YEAR_LIMIT = 2018;
export const DOWNLOAD_DIR = path.join(PROJECT_ROOT, "downloads");
