import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import { articleExists, getArticle, getStats, initDB, saveArticle } from "../src/data/database";

const TEST_DB = "test_data.db";

describe("Database Module", () => {
  beforeAll(() => {
    // Initialize with a test database file
    initDB(TEST_DB);
  });

  afterAll(async () => {
    // Cleanup
    try {
      await fs.unlink(TEST_DB);
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
    saveArticle(article);

    // Verify existence
    expect(articleExists(article.link)).toBe(true);

    // Retrieve and check
    const retrieved = getArticle(article.link);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.title).toBe(article.title);
    expect(retrieved?.tags).toEqual(article.tags);
    expect(retrieved?.images).toEqual(article.images);
  });

  test("should handle duplicate links gracefully (IGNORE)", () => {
    const link = "https://example.com/duplicate";
    const article1 = {
      link,
      title: "Original",
      date: "2024-01-01",
      description: "desc",
      tags: [],
      images: [],
    };
    const article2 = {
      link,
      title: "Duplicate", // Changed title
      date: "2024-01-01",
      description: "desc",
      tags: [],
      images: [],
    };

    saveArticle(article1);
    saveArticle(article2); // Should be ignored

    const saved = getArticle(link);
    expect(saved?.title).toBe("Original");
  });

  test("should return correct stats", () => {
    const initialCount = getStats();

    saveArticle({
      link: `https://example.com/stats-${Math.random()}`,
      title: "Stats Test",
      date: "2024-01-01",
      description: "desc",
      tags: [],
      images: [],
    });

    expect(getStats()).toBe(initialCount + 1);
  });
});
