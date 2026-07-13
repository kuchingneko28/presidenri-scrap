import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { unlink } from "node:fs/promises";
import { DatabaseService } from "../src/services/DatabaseService";

const TEST_DB = "test_data.db";

describe("DatabaseService", () => {
  let db: DatabaseService;

  beforeAll(() => {
    db = new DatabaseService(TEST_DB);
  });

  afterAll(async () => {
    db.close();
    try {
      await unlink(TEST_DB);
    } catch (e) {}
  });

  test("should save and retrieve an article", () => {
    const article = {
      link: "https://example.com/test-article",
      title: "Test Article",
      date: "2024-01-01T00:00:00",
      description: "A test description",
      tags: ["test", "mock"],
      images: ["img1.jpg", "img2.jpg"],
    };

    // Save
    db.saveArticle(article);

    // Verify existence
    expect(db.articleExistsByLink(article.link)).toBe(true);
  });

  test("should return correct stats", () => {
    const initialCount = db.getStats();

    db.saveArticle({
      link: `https://example.com/stats-${Math.random()}`,
      title: "Stats Test",
      date: "2024-01-01",
      description: "desc",
      tags: [],
      images: [],
    });

    expect(db.getStats()).toBe(initialCount + 1);
  });

  test("should search articles with query, tag, limit, offset, and limit: -1", () => {
    const art1 = {
      postId: 101,
      link: "https://example.com/search-1",
      title: "Prabowo Subianto Inauguration",
      date: "2024-10-20",
      description: "President Prabowo Subianto was inaugurated.",
      tags: ["Foto", "Inauguration"],
      images: ["img1.jpg"],
    };
    const art2 = {
      postId: 102,
      link: "https://example.com/search-2",
      title: "Cabinet Announcement",
      date: "2024-10-21",
      description: "President Prabowo announced the cabinet.",
      tags: ["Foto", "Cabinet"],
      images: ["img2.jpg"],
    };
    const art3 = {
      postId: 103,
      link: "https://example.com/search-3",
      title: "E-Album Prabowo",
      date: "2024-10-22",
      description: "E-Album of President Prabowo.",
      tags: ["E-Album"],
      images: ["img3.jpg"],
    };

    db.saveArticle(art1);
    db.saveArticle(art2);
    db.saveArticle(art3);

    // Search by query
    const queryResults = db.searchArticles("Inauguration");
    expect(queryResults.length).toBe(1);
    expect(queryResults[0]?.postId).toBe(101);

    // Search by tag
    const tagResults = db.searchArticles("", { tag: "E-Album" });
    expect(tagResults.length).toBe(1);
    expect(tagResults[0]?.postId).toBe(103);

    // Search with limit and offset
    const pagedResults = db.searchArticles("Prabowo", { limit: 1, offset: 1 });
    expect(pagedResults.length).toBe(1);

    // Search with limit: -1 (no limit)
    const allResults = db.searchArticles("Prabowo", { limit: -1 });
    expect(allResults.length).toBeGreaterThanOrEqual(3);
  });
});
