import { describe, expect, mock, test } from "bun:test";
import { scrapePage } from "../src/core/scraper";
import * as db from "../src/data/database";

// Mock Database
mock.module("../src/data/database", () => {
  return {
    articleExists: mock(() => false),
    saveArticle: mock(() => {}),
    getArticle: mock(() => null),
  };
});

// Mock UI
mock.module("../src/ui/display", () => {
  return {
    startSpinner: mock(() => {}),
    stopSpinner: mock(() => {}),
    updateSpinner: mock(() => {}),
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock((msg) => console.log("UI Error:", msg)),
    success: mock(() => {}),
    log: mock(() => {}),
    failSpinner: mock(() => {}),
  };
});

describe("Scraper", () => {
  test("should parse articles correctly", async () => {
    const mockHtml = `
            <html>
                <body>
                    <article class="media">
                        <div class="title"><a href="https://example.com/article1">Article Title</a></div>
                        <div class="datetime">Senin, 1 Januari 2024 10:00 WIB</div>
                    </article>
                </body>
            </html>
        `;

    const mockDetailHtml = `
            <html>
                <body>
                     <div class="excerpt">Description</div>
                     <div class="flexslider">
                        <ul class="slides">
                            <li><div class="content"><a data-fancybox="gallery" href="img1.jpg"></a></div></li>
                        </ul>
                     </div>
                </body>
            </html>
        `;

    // Mock Fetch
    global.fetch = mock(async (url: string) => {
      if (url.includes("article1")) return new Response(mockDetailHtml);
      return new Response(mockHtml); // Default to index page
    }) as any;

    const result = await scrapePage(1, { verbose: false, download: false });

    expect(result.count).toBe(1);
    expect(db.saveArticle).toHaveBeenCalled();
  });

  test("should stop if no articles found", async () => {
    global.fetch = mock(async () => new Response("<html><body></body></html>")) as any;
    const result = await scrapePage(1, { verbose: false });
    expect(result.stop).toBe(true);
  });
});
