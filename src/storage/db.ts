import { Database, type Statement } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DB_PATH } from "../config";
import type { Article, DatabaseStats, SearchOptions } from "../types";

interface ArticleRow {
  post_id: number;
  link: string;
  title: string;
  date: string;
  description: string;
  tags: string;
  images: string;
  modified: string | null;
  created_at: string;
}

export class ArticleRepository {
  private db: Database;
  private stmtExistsByLink!: Statement<{ "1": number }, [string]>;
  private stmtGetModified!: Statement<{ modified: string | null }, [number]>;
  private stmtGetByPostId!: Statement<ArticleRow, [number]>;
  private stmtGetByLink!: Statement<ArticleRow, [string]>;
  private stmtUpsert!: Statement<unknown, [number, string, string, string, string, string, string, string | null]>;
  private stmtGetPaged!: Statement<ArticleRow, [number, number]>;
  private stmtGetStats!: Statement<{ count: number }, []>;
  private stmtGetImageStats!: Statement<{ totalImages: number; articlesWithImages: number }, []>;

  constructor(dbPath: string = DB_PATH) {
    mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath, { create: true });
    this.init();
    this.compileStatements();
  }

  private init(): void {
    this.db.run("PRAGMA journal_mode = WAL;");
    this.db.run("PRAGMA busy_timeout = 5000;");

    // Check if migration from legacy `id` PK is needed
    try {
      const tableInfo = this.db.query<{ name: string; pk: number }, []>("PRAGMA table_info(articles)").all();
      const hasIdPk = tableInfo.some((col) => col.name === "id" && col.pk === 1);
      if (hasIdPk) {
        this.db.run(`
          CREATE TABLE IF NOT EXISTS articles_v2 (
            post_id INTEGER PRIMARY KEY,
            link TEXT UNIQUE,
            title TEXT,
            date TEXT,
            description TEXT,
            tags TEXT,
            images TEXT,
            modified TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
        this.db.run(`
          INSERT OR IGNORE INTO articles_v2 (post_id, link, title, date, description, tags, images, modified, created_at)
          SELECT COALESCE(post_id, id), link, title, date, description, tags, images, modified, created_at FROM articles
        `);
        this.db.run("DROP TABLE articles");
        this.db.run("ALTER TABLE articles_v2 RENAME TO articles");
      }
    } catch {}

    this.db.run(`CREATE TABLE IF NOT EXISTS articles (
      post_id INTEGER PRIMARY KEY,
      link TEXT UNIQUE,
      title TEXT,
      date TEXT,
      description TEXT,
      tags TEXT,
      images TEXT,
      modified TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    this.db.run("CREATE INDEX IF NOT EXISTS idx_articles_link ON articles (link);");
    this.db.run("CREATE INDEX IF NOT EXISTS idx_articles_date ON articles (date DESC);");
  }

  private compileStatements(): void {
    this.stmtExistsByLink = this.db.query<{ "1": number }, [string]>("SELECT 1 FROM articles WHERE link = ?");
    this.stmtGetModified = this.db.query<{ modified: string | null }, [number]>("SELECT modified FROM articles WHERE post_id = ?");
    this.stmtGetByPostId = this.db.query<ArticleRow, [number]>("SELECT * FROM articles WHERE post_id = ?");
    this.stmtGetByLink = this.db.query<ArticleRow, [string]>("SELECT * FROM articles WHERE link = ?");
    this.stmtUpsert = this.db.query(
      `INSERT INTO articles (post_id, link, title, date, description, tags, images, modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(post_id) DO UPDATE SET
         link = excluded.link,
         title = excluded.title,
         date = excluded.date,
         description = excluded.description,
         tags = excluded.tags,
         images = excluded.images,
         modified = excluded.modified`
    );
    this.stmtGetPaged = this.db.query<ArticleRow, [number, number]>("SELECT * FROM articles ORDER BY date DESC LIMIT ? OFFSET ?");
    this.stmtGetStats = this.db.query<{ count: number }, []>("SELECT COUNT(*) as count FROM articles");
    this.stmtGetImageStats = this.db.query<{ totalImages: number; articlesWithImages: number }, []>(
      `SELECT
        COALESCE(SUM(json_array_length(CASE WHEN images != '[]' THEN images ELSE '[]' END)), 0) as totalImages,
        COALESCE(SUM(CASE WHEN images != '[]' THEN 1 ELSE 0 END), 0) as articlesWithImages
       FROM articles`
    );
  }

  private mapRow(row: ArticleRow): Article {
    let tags: string[] = [];
    let images: string[] = [];
    try {
      tags = JSON.parse(row.tags);
    } catch {}
    try {
      images = JSON.parse(row.images);
    } catch {}

    return {
      postId: row.post_id,
      link: row.link,
      title: row.title,
      date: row.date,
      description: row.description,
      tags,
      images,
      modified: row.modified ?? undefined,
    };
  }

  exists(link: string): boolean {
    return !!this.stmtExistsByLink.get(link);
  }

  getModified(postId: number): string | null {
    const result = this.stmtGetModified.get(postId);
    return result ? result.modified : null;
  }

  getByPostId(postId: number): Article | null {
    const row = this.stmtGetByPostId.get(postId);
    return row ? this.mapRow(row) : null;
  }

  getByLink(link: string): Article | null {
    const row = this.stmtGetByLink.get(link);
    return row ? this.mapRow(row) : null;
  }

  save(article: Article): void {
    const postId = article.postId || Math.floor(Date.now() + Math.random() * 1000);
    this.stmtUpsert.run(
      postId,
      article.link,
      article.title,
      article.date,
      article.description,
      JSON.stringify(article.tags || []),
      JSON.stringify(article.images || []),
      article.modified ?? null
    );
  }

  getPaged(limit: number, offset: number = 0): Article[] {
    return this.stmtGetPaged.all(limit, offset).map((row) => this.mapRow(row));
  }

  getAll(options: { since?: string; limit?: number } = {}): Article[] {
    let sql = "SELECT * FROM articles WHERE 1=1";
    const params: (string | number)[] = [];

    if (options.since) {
      sql += " AND date >= ?";
      params.push(options.since);
    }

    sql += " ORDER BY date DESC";

    if (options.limit && options.limit > 0) {
      sql += " LIMIT ?";
      params.push(options.limit);
    }

    const stmt = this.db.query<ArticleRow, (string | number)[]>(sql);
    return stmt.all(...params).map((row) => this.mapRow(row));
  }

  search(query: string, options: SearchOptions = {}): Article[] {
    const limit = options.limit ?? 10;
    const offset = options.offset ?? 0;
    const tag = options.tag;

    let sql = "SELECT * FROM articles WHERE 1=1";
    const params: (string | number)[] = [];

    if (query) {
      sql += " AND (title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')";
      const like = `%${query.replace(/[%_]/g, "\\$&")}%`;
      params.push(like, like);
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

    const stmt = this.db.query<ArticleRow, (string | number)[]>(sql);
    return stmt.all(...params).map((row) => this.mapRow(row));
  }

  getStats(): DatabaseStats {
    const totalArticles = this.stmtGetStats.get()?.count ?? 0;
    const img = this.stmtGetImageStats.get();
    return {
      totalArticles,
      totalImages: img?.totalImages ?? 0,
      articlesWithImages: img?.articlesWithImages ?? 0,
    };
  }

  close(): void {
    this.db.close();
  }
}
