import { Database } from "bun:sqlite";
import path from "node:path";
import { STORAGE_DIR } from "../config/constants";

const DB_PATH = path.join(STORAGE_DIR, "data.db");
let db: Database;
interface RawArticle {
  id?: number;
  link: string;
  title: string;
  date: string;
  description: string;
  tags: string;
  images: string;
  created_at: string;
}

export function initDB(path: string = DB_PATH): void {
  db = new Database(path, { create: true });

  db.run(`CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        link TEXT UNIQUE,
        title TEXT,
        date TEXT,
        description TEXT,
        tags TEXT,
        images TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

  // Migration support
  try {
    db.run(`ALTER TABLE articles ADD COLUMN tags TEXT`);
  } catch (e) {}
}

export interface Article {
  id?: number;
  link: string;
  title: string;
  date: string;
  description: string;
  tags: string[];
  images: string[];
}

export function articleExists(link: string): boolean {
  const query = db.query("SELECT 1 FROM articles WHERE link = ?");
  return !!query.get(link);
}

export function getArticle(link: string): Article | null {
  const query = db.query("SELECT * FROM articles WHERE link = ?");
  const result = query.get(link) as RawArticle | null;

  if (result) {
    try {
      return {
        ...result,
        images: JSON.parse(result.images || "[]"),
        tags: JSON.parse(result.tags || "[]"),
      } as Article;
    } catch (e: unknown) {
      return {
        ...result,
        images: [],
        tags: [],
      } as Article;
    }
  }
  return null;
}

export function saveArticle(article: Omit<Article, "id">): void {
  const query = db.query(`
        INSERT OR IGNORE INTO articles (link, title, date, description, tags, images)
        VALUES ($link, $title, $date, $description, $tags, $images)
    `);

  query.run({
    $link: article.link,
    $title: article.title,
    $date: article.date,
    $description: article.description,
    $tags: JSON.stringify(article.tags),
    $images: JSON.stringify(article.images),
  });
}

export function getStats(): number {
  const result = db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM articles").get();
  return result?.count || 0;
}
