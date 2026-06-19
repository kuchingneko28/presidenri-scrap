import { Database, type Statement } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { STORAGE_DIR } from "../config/constants";
import type { Article } from "../types";

const DEFAULT_DB_PATH = path.join(STORAGE_DIR, "data.db");

interface RawArticle {
  id?: number;
  post_id?: number;
  link: string;
  title: string;
  date: string;
  description: string;
  tags: string;
  images: string;
  modified?: string;
  created_at: string;
}

export class DatabaseService {
  private db: Database;

  // Pre-compiled statements — parsed once, reused for every call
  private stmtArticleExistsByPostId!: Statement<unknown, [number]>;
  private stmtArticleExistsByLink!: Statement<unknown, [string]>;
  private stmtGetArticleModifiedDate!: Statement<{ modified: string | null }, [number]>;
  private stmtGetArticleByPostId!: Statement<RawArticle, [number]>;
  private stmtGetArticleByLink!: Statement<RawArticle, [string]>;
  private stmtInsertArticle!: Statement<unknown, [string, string, string, string, string, string, number | null, string | null]>;
  private stmtGetAllArticles!: Statement<RawArticle, []>;
  private stmtGetStats!: Statement<{ count: number }, []>;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    mkdirSync(STORAGE_DIR, { recursive: true });
    this.db = new Database(dbPath, { create: true });
    this.init();
    this.compileStatements();
  }

  private init(): void {
    this.db.run("PRAGMA journal_mode = WAL;");
    this.db.run("PRAGMA busy_timeout = 5000;");

    this.db.run(`CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER,
        link TEXT UNIQUE,
        title TEXT,
        date TEXT,
        description TEXT,
        tags TEXT,
        images TEXT,
        modified TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    this.db.run("CREATE INDEX IF NOT EXISTS idx_articles_post_id ON articles (post_id);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_articles_link ON articles (link);");

    // Column migrations (safe to re-run)
    try { this.db.run("ALTER TABLE articles ADD COLUMN modified TEXT"); } catch { /* ignore */ }
    try { this.db.run("ALTER TABLE articles ADD COLUMN post_id INTEGER"); } catch { /* ignore */ }
  }

  private compileStatements(): void {
    this.stmtArticleExistsByPostId = this.db.query("SELECT 1 FROM articles WHERE post_id = ?");
    this.stmtArticleExistsByLink = this.db.query("SELECT 1 FROM articles WHERE link = ?");
    this.stmtGetArticleModifiedDate = this.db.query<{ modified: string | null }, [number]>(
      "SELECT modified FROM articles WHERE post_id = ?"
    );
    this.stmtGetArticleByPostId = this.db.query<RawArticle, [number]>(
      "SELECT * FROM articles WHERE post_id = ?"
    );
    this.stmtGetArticleByLink = this.db.query<RawArticle, [string]>(
      "SELECT * FROM articles WHERE link = ?"
    );
    this.stmtInsertArticle = this.db.query(
      `INSERT OR REPLACE INTO articles (link, title, date, description, tags, images, post_id, modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    this.stmtGetAllArticles = this.db.query<RawArticle, []>("SELECT * FROM articles");
    this.stmtGetStats = this.db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM articles");
  }

  articleExistsByPostId(postId: number): boolean {
    return !!this.stmtArticleExistsByPostId.get(postId);
  }

  articleExistsByLink(link: string): boolean {
    return !!this.stmtArticleExistsByLink.get(link);
  }

  getArticleModifiedDate(postId: number): string | null {
    const result = this.stmtGetArticleModifiedDate.get(postId);
    return result ? result.modified : null;
  }

  private mapRawArticleToArticle(result: RawArticle): Article {
    return {
      post_id: result.post_id,
      link: result.link,
      title: result.title,
      date: result.date,
      description: result.description,
      tags: JSON.parse(result.tags),
      images: JSON.parse(result.images),
      modified: result.modified || undefined,
    };
  }

  getArticleByPostId(postId: number): Article | null {
    const result = this.stmtGetArticleByPostId.get(postId);
    return result ? this.mapRawArticleToArticle(result) : null;
  }

  getArticleByLink(link: string): Article | null {
    const result = this.stmtGetArticleByLink.get(link);
    return result ? this.mapRawArticleToArticle(result) : null;
  }

  saveArticle(article: Article): void {
    this.stmtInsertArticle.run(
      article.link,
      article.title,
      article.date,
      article.description,
      JSON.stringify(article.tags),
      JSON.stringify(article.images),
      article.post_id ?? null,
      article.modified ?? null,
    );
  }

  getAllArticles(): Article[] {
    return this.stmtGetAllArticles.all().map((row: RawArticle) => this.mapRawArticleToArticle(row));
  }

  getStats(): number {
    return this.stmtGetStats.get()?.count || 0;
  }

  close(): void {
    this.db.close();
  }
}
