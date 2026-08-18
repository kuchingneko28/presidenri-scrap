export interface Article {
  postId: number;
  link: string;
  title: string;
  date: string;
  description: string;
  tags: string[];
  images: string[];
  modified?: string;
}

export interface WordPressMedia {
  id: number;
  source_url: string;
  media_details?: {
    file?: string;
    original_image?: string;
    sizes?: Record<string, { source_url: string }>;
  };
}

export interface WordPressTerm {
  id: number;
  name: string;
  slug: string;
  taxonomy: string;
}

export interface WordPressPost {
  id: number;
  date: string;
  modified: string;
  link: string;
  title: {
    rendered: string;
  };
  excerpt: {
    rendered: string;
  };
  content?: {
    rendered: string;
  };
  featured_media?: number;
  yoast_head_json?: {
    og_image?: { url: string }[] | { url: string };
  } | null;
  _embedded?: {
    "wp:featuredmedia"?: WordPressMedia[];
    "wp:term"?: WordPressTerm[][];
  };
}

export interface DownloadItem {
  title: string;
  date: string;
  imageUrl: string;
  index: number;
  postUrl?: string;
}

export interface ScrapeOptions {
  download?: boolean;
  verbose?: boolean;
  force?: boolean;
  perPage?: number;
  filter?: string;
  search?: string;
  since?: string;
  before?: string;
  limit?: number;
  type?: string;
  dryRun?: boolean;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  tag?: string;
  json?: boolean;
}

export interface DatabaseStats {
  totalArticles: number;
  totalImages: number;
  articlesWithImages: number;
}
