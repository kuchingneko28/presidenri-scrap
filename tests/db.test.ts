import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ArticleRepository } from "../src/storage/db";
import { unlinkSync, existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

describe("ArticleRepository", () => {
  let db: ArticleRepository;
  let testDbPath: string;

  beforeEach(() => {
    testDbPath = path.join(os.tmpdir(), `test-presidenri-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
    db = new ArticleRepository(testDbPath);
  });

  afterEach(() => {
    db.close();
    if (existsSync(testDbPath)) unlinkSync(testDbPath);
    if (existsSync(`${testDbPath}-wal`)) unlinkSync(`${testDbPath}-wal`);
    if (existsSync(`${testDbPath}-shm`)) unlinkSync(`${testDbPath}-shm`);
  });

  it("should save and retrieve an article", () => {
    const article = {
      postId: 1001,
      link: "https://www.presidenri.go.id/foto/kunjungan-kerja-1001/",
      title: "Kunjungan Kerja Presiden",
      date: "2024-11-01",
      description: "Presiden melakukan kunjungan kerja di Jawa Tengah.",
      tags: ["Foto", "Kunjungan"],
      images: ["https://www.presidenri.go.id/uploads/2024/11/photo1.jpg"],
      modified: "2024-11-01T12:00:00",
    };

    db.save(article);

    expect(db.exists(article.link)).toBe(true);
    expect(db.getModified(1001)).toBe("2024-11-01T12:00:00");

    const retrieved = db.getByPostId(1001);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.title).toBe("Kunjungan Kerja Presiden");
    expect(retrieved?.tags).toEqual(["Foto", "Kunjungan"]);
    expect(retrieved?.images).toEqual(["https://www.presidenri.go.id/uploads/2024/11/photo1.jpg"]);
  });

  it("should calculate correct stats", () => {
    db.save({
      postId: 1,
      link: "https://www.presidenri.go.id/foto/1/",
      title: "Article 1",
      date: "2024-11-01",
      description: "Desc 1",
      tags: ["Foto"],
      images: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
    });

    db.save({
      postId: 2,
      link: "https://www.presidenri.go.id/foto/2/",
      title: "Article 2",
      date: "2024-11-02",
      description: "Desc 2",
      tags: ["Foto"],
      images: ["https://example.com/3.jpg"],
    });

    const stats = db.getStats();
    expect(stats.totalArticles).toBe(2);
    expect(stats.articlesWithImages).toBe(2);
    expect(stats.totalImages).toBe(3);
  });

  it("should search articles by query and tag", () => {
    db.save({
      postId: 10,
      link: "https://www.presidenri.go.id/foto/prabowo-bertemu-menteri/",
      title: "Presiden Prabowo Bertemu Menteri",
      date: "2024-11-05",
      description: "Pertemuan kabinet",
      tags: ["Foto", "Kabinet"],
      images: [],
    });

    db.save({
      postId: 11,
      link: "https://www.presidenri.go.id/foto/kegiatan-lain/",
      title: "Kegiatan Resmi",
      date: "2024-11-06",
      description: "Rapat kerja",
      tags: ["Foto"],
      images: [],
    });

    const searchResults = db.search("Prabowo");
    expect(searchResults.length).toBe(1);
    expect(searchResults[0]?.title).toBe("Presiden Prabowo Bertemu Menteri");

    const tagResults = db.search("", { tag: "Kabinet" });
    expect(tagResults.length).toBe(1);
  });
});
