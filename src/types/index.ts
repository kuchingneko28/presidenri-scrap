export interface DownloadItem {
  title: string;
  date: string; // YYYY-MM-DD or ISO
  imageUrl: string;
  index: number;
  postUrl?: string;
}

export interface Article {
  id?: number;
  post_id?: number;
  link: string;
  title: string;
  date: string;
  description: string;
  tags: string[];
  images: string[];
  modified?: string;
}

export interface ScraperStats {
  page: number;
  found: number;
  processed?: number;
  queued: number;
  pending: number;
  active: number;
  done: number;
  failed: number;
  bytesDownloaded: number;
  bytesTotal: number;
  total?: number;
  state: "idle" | "scraping" | "syncing" | "downloading" | "completed" | "error";
}

export interface ScraperOptions {
  download?: boolean;
  verbose?: boolean;
  force?: boolean;
  perPage?: number;
  startPage?: number;
  stopAfterEmptyPages?: number;
  filter?: string;
  since?: string;
  limit?: number;
}
