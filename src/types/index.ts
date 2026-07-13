export type ScraperState = "idle" | "scraping" | "syncing" | "downloading" | "completed" | "error";
export type PostType = "photo" | "photo-ebook" | (string & {});

export interface DownloadItem {
  title: string;
  date: string;
  imageUrl: string;
  index: number;
  postUrl?: string;
}

export interface Article {
  id?: number;
  postId?: number;
  link: string;
  title: string;
  date: string;
  description: string;
  tags: string[];
  images: string[];
  modified?: string;
}

export interface FetchResult {
  response: Response;
  buffer: Uint8Array;
  contentLength: number;
  receivedLength: number;
}

export interface StreamReadResult {
  length: number;
  data: Uint8Array[];
}

export interface DownloadStats {
  queued: number;
  active: number;
  done: number;
  failed: number;
  bytesDownloaded: number;
  bytesTotal: number;
  pending: number;
  skipped: number;
}

export interface ScraperStats {
  page: number;
  found: number;
  queued: number;
  pending: number;
  active: number;
  done: number;
  failed: number;
  bytesDownloaded: number;
  bytesTotal: number;
  total?: number;
  state: ScraperState;
  skipped: number;
}

export interface ScraperOptions {
  download?: boolean;
  verbose?: boolean;
  force?: boolean;
  perPage?: number;
  startPage?: number;
  stopAfterEmptyPages?: number;
  all?: boolean;
  filter?: string;
  search?: string;
  since?: string;
  before?: string;
  limit?: number;
  dryRun?: boolean;
  postType?: PostType;
  pageDelay?: number;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  tag?: string;
  json?: boolean;
}

