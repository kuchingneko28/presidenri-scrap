import { Database, type Statement } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { STORAGE_DIR, SQL_BUSY_TIMEOUT_MS } from "../config/constants";
import type { Article } from "../types";

const DEFAULT_DB_PATH = path.join(STORAGE_DIR, "data.db");

interface RawArticle {
  id: number;
  post_id: number | null;
  link: string;
  title: string;
  date: string;
  description: string;
  tags: string;
  images: string;
  modified: string | null;
  created_at: string;
}

export class DatabaseService {
  private db: Database;

  // Pre-compiled statements — parsed once, reused for every call
  private stmtArticleExistsByLink!: Statement<unknown, [string]>;
  private stmtGetArticleModifiedDate!: Statement<{ modified: string | null }, [number]>;
  private stmtGetArticleByPostId!: Statement<RawArticle, [number]>;
  private stmtGetArticleByLink!: Statement<RawArticle, [string]>;
  private stmtInsertArticle!: Statement<unknown, [string, string, string, string, string, string, number | null, string | null]>;
  private stmtGetArticlesPaged!: Statement<RawArticle, [number, number]>;
  private stmtGetStats!: Statement<{ count: number }, []>;
  private stmtGetImageStats!: Statement<{ totalImages: number; articlesWithImages: number }, []>;
  private dryRun = false;

  constructor(dbPath: string = DEFAULT_DB_PATH) {
    mkdirSync(STORAGE_DIR, { recursive: true });
    this.db = new Database(dbPath, { create: true });
    this.init();
    this.compileStatements();
  }

  public setDryRun(value: boolean): void {
    this.dryRun = value;
  }

  private init(): void {
    this.db.run("PRAGMA journal_mode = WAL;");
    this.db.run(`PRAGMA busy_timeout = ${SQL_BUSY_TIMEOUT_MS};`);

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
    this.db.run("CREATE INDEX IF NOT EXISTS idx_articles_date ON articles (date DESC);");

    // Column migrations (safe to re-run)
    this.tryAddColumn("ALTER TABLE articles ADD COLUMN modified TEXT", "modified");
    this.tryAddColumn("ALTER TABLE articles ADD COLUMN post_id INTEGER", "post_id");
  }

  private tryAddColumn(sql: string, label: string): void {
    try {
      this.db.run(sql);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes("duplicate column name")) {
        console.error(`Migration failed for column '${label}': ${msg}`);
      }
    }
  }

  private compileStatements(): void {
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
      `INSERT INTO articles (link, title, date, description, tags, images, post_id, modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(link) DO UPDATE SET
         title = excluded.title,
         date = excluded.date,
         description = excluded.description,
         tags = excluded.tags,
         images = excluded.images,
         post_id = excluded.post_id,
         modified = excluded.modified`
    );
    this.stmtGetArticlesPaged = this.db.query<RawArticle, [number, number]>(
      "SELECT * FROM articles LIMIT ? OFFSET ?"
    );
    this.stmtGetStats = this.db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM articles");
    this.stmtGetImageStats = this.db.query<{ totalImages: number; articlesWithImages: number }, []>(
      `SELECT
        SUM(json_array_length(CASE WHEN images != '[]' THEN images ELSE '[]' END)) as totalImages,
        SUM(CASE WHEN images != '[]' THEN 1 ELSE 0 END) as articlesWithImages
       FROM articles`
    );
  }

  articleExistsByLink(link: string): boolean {
    return !!this.stmtArticleExistsByLink.get(link);
  }

  getArticleModifiedDate(postId: number): string | null {
    const result = this.stmtGetArticleModifiedDate.get(postId);
    return result ? result.modified : null;
  }

  private safeParseJsonArray(str: string): string[] {
    try {
      const parsed = JSON.parse(str);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private mapRawArticleToArticle(result: RawArticle): Article {
    return {
      postId: result.post_id ?? undefined,
      link: result.link,
      title: result.title,
      date: result.date,
      description: result.description,
      tags: this.safeParseJsonArray(result.tags),
      images: this.safeParseJsonArray(result.images),
      modified: result.modified ?? undefined,
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
    if (this.dryRun) {
      return;
    }
    this.stmtInsertArticle.run(
      article.link,
      article.title,
      article.date,
      article.description,
      JSON.stringify(article.tags),
      JSON.stringify(article.images),
      article.postId ?? null,
      article.modified ?? null,
    );
  }

  getArticlesPaged(limit: number, offset: number): Article[] {
    return this.stmtGetArticlesPaged.all(limit, offset).map((row: RawArticle) => this.mapRawArticleToArticle(row));
  }

  searchArticles(queryText: string, options: { limit?: number; offset?: number; tag?: string } = {}): Article[] {
    const limit = options.limit ?? 10;
    const offset = options.offset ?? 0;
    const tag = options.tag;

    let sql = "SELECT * FROM articles WHERE 1=1";
    const params: (string | number)[] = [];

    if (queryText) {
      sql += " AND (title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')";
      const likeParam = `%${queryText.replace(/[%_]/g, "\\$&")}%`;
      params.push(likeParam, likeParam);
    }

    if (tag) {
      sql += " AND tags LIKE ? ESCAPE '\\'";
      params.push(`%${tag.replace(/[%_]/g, "\\$&")}%`);
    }

    if (limit !== -1) {
      sql += " ORDER BY date DESC LIMIT ? OFFSET ?";
      params.push(limit, offset);
    } else {
      sql += " ORDER BY date DESC";
    }

    const stmt = this.db.query<RawArticle, (string | number)[]>(sql);
    return stmt.all(...params).map((row) => this.mapRawArticleToArticle(row));
  }

  getStats(): number {
    return this.stmtGetStats.get()?.count ?? 0;
  }

  getImageStats(): { totalImages: number; articlesWithImages: number } {
    const result = this.stmtGetImageStats.get();
    return { totalImages: result?.totalImages ?? 0, articlesWithImages: result?.articlesWithImages ?? 0 };
  }

  close(): void {
    this.db.close();
  }
}
