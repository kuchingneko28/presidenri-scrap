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
});
