export interface WordPressMedia {
  id: number;
  date: string;
  slug: string;
  type: string;
  link: string;
  title: {
    rendered: string;
  };
  author: number;
  caption: {
    rendered: string;
  };
  alt_text: string;
  media_type: string;
  mime_type: string;
  media_details: {
    width: number;
    height: number;
    file: string;
    filesize: number;
    sizes: Record<string, {
      file: string;
      width: number;
      height: number;
      filesize: number;
      mime_type: string;
      source_url: string;
    }>;
  };
  source_url: string;
  guid?: {
    rendered: string;
  };
}

export interface WordPressPost {
  id: number;
  date: string;
  link: string;
  title: {
    rendered: string;
  };
  excerpt: {
    rendered: string;
  };
  content: {
    rendered: string;
  };
  featured_media: number;
  modified: string;
  yoast_head_json?: Record<string, unknown> | null;
  _embedded?: {
    "wp:featuredmedia"?: WordPressMedia[];
  };
}
