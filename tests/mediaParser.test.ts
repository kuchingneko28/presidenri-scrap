import { describe, expect, test } from "bun:test";
import { MediaParser } from "../src/utils/MediaParser";

describe("MediaParser - extractFromHtml", () => {
  const baseUrl = "https://www.presidenri.go.id/article-url";

  test("extracts image from src attribute", () => {
    const html = `<img src="https://www.presidenri.go.id/image.jpg" />`;
    const images = MediaParser.extractFromHtml(html, baseUrl);
    expect(images).toContain("https://www.presidenri.go.id/image.jpg");
  });

  test("extracts images from srcset", () => {
    const html = `<img srcset="https://www.presidenri.go.id/img-small.jpg 300w, https://www.presidenri.go.id/img-large.jpg 1024w" />`;
    const images = MediaParser.extractFromHtml(html, baseUrl);
    expect(images).toContain("https://www.presidenri.go.id/img-small.jpg");
    expect(images).toContain("https://www.presidenri.go.id/img-large.jpg");
  });

  test("extracts images from a tags", () => {
    const html = `<a href="https://www.presidenri.go.id/full.jpg">View Full</a>`;
    const images = MediaParser.extractFromHtml(html, baseUrl);
    expect(images).toContain("https://www.presidenri.go.id/full.jpg");
  });

  test("ignores non-image links", () => {
    const html = `<a href="https://www.presidenri.go.id/page.html">View Page</a>`;
    const images = MediaParser.extractFromHtml(html, baseUrl);
    expect(images).not.toContain("https://www.presidenri.go.id/page.html");
  });

  test("resolves relative URLs", () => {
    const html = `<img src="/assets/photo.jpg" />`;
    const images = MediaParser.extractFromHtml(html, baseUrl);
    expect(images).toContain("https://www.presidenri.go.id/assets/photo.jpg");
  });

  test("cleans beta domain to standard domain", () => {
    const html = `<img src="https://beta.presidenri.go.id/test.png" />`;
    const images = MediaParser.extractFromHtml(html, baseUrl);
    expect(images).toContain("https://www.presidenri.go.id/test.png");
    expect(images).not.toContain("https://beta.presidenri.go.id/test.png");
  });

  test("deduplicates images", () => {
    const html = `
      <img src="https://www.presidenri.go.id/photo.jpg" />
      <a href="https://www.presidenri.go.id/photo.jpg">View</a>
    `;
    const images = MediaParser.extractFromHtml(html, baseUrl);
    const occurrences = images.filter((u) => u === "https://www.presidenri.go.id/photo.jpg");
    expect(occurrences).toHaveLength(1);
  });

  test("returns empty array for no images", () => {
    const html = `<p>No images here</p>`;
    const images = MediaParser.extractFromHtml(html, baseUrl);
    expect(images).toEqual([]);
  });

  test("extracts from data-srcset when srcset is missing", () => {
    const html = `<img src="/thumb.jpg" data-srcset="https://www.presidenri.go.id/full.jpg 1024w" />`;
    const images = MediaParser.extractFromHtml(html, baseUrl);
    expect(images).toContain("https://www.presidenri.go.id/full.jpg");
  });
});

describe("MediaParser - extractFromSlider", () => {
  const baseUrl = "https://www.presidenri.go.id/photo/gallery-post";

  test("prefers fancybox href over flexslider img src", () => {
    const html = `
      <div class="flexslider">
        <ul class="slides">
          <li>
            <a data-fancybox="gallery" href="https://www.presidenri.go.id/uploads/photo-full.jpg">
              <img src="https://www.presidenri.go.id/uploads/photo-thumb.jpg" />
            </a>
          </li>
        </ul>
      </div>
    `;
    const images = MediaParser.extractFromPageHtml(html, baseUrl);
    expect(images).toContain("https://www.presidenri.go.id/uploads/photo-full.jpg");
    expect(images).not.toContain("https://www.presidenri.go.id/uploads/photo-thumb.jpg");
  });

  test("extracts multiple fancybox gallery images", () => {
    const html = `
      <div class="flexslider">
        <ul class="slides">
          <li><a data-fancybox="gallery" href="https://www.presidenri.go.id/uploads/img1.jpg"><img src="thumb1.jpg" /></a></li>
          <li><a data-fancybox="gallery" href="https://www.presidenri.go.id/uploads/img2.jpg"><img src="thumb2.jpg" /></a></li>
          <li><a data-fancybox="gallery" href="https://www.presidenri.go.id/uploads/img3.jpg"><img src="thumb3.jpg" /></a></li>
        </ul>
      </div>
    `;
    const images = MediaParser.extractFromPageHtml(html, baseUrl);
    expect(images).toHaveLength(3);
    expect(images).toContain("https://www.presidenri.go.id/uploads/img1.jpg");
    expect(images).toContain("https://www.presidenri.go.id/uploads/img2.jpg");
    expect(images).toContain("https://www.presidenri.go.id/uploads/img3.jpg");
  });

  test("falls back to flexslider img when no fancybox links", () => {
    const html = `
      <div class="flexslider">
        <ul class="slides">
          <li><img src="https://www.presidenri.go.id/uploads/photo1.jpg" /></li>
          <li><img src="https://www.presidenri.go.id/uploads/photo2.jpg" /></li>
        </ul>
      </div>
    `;
    const images = MediaParser.extractFromPageHtml(html, baseUrl);
    expect(images).toContain("https://www.presidenri.go.id/uploads/photo1.jpg");
    expect(images).toContain("https://www.presidenri.go.id/uploads/photo2.jpg");
  });

  test("returns empty array for no slider content", () => {
    const html = `<div class="content"><p>No gallery</p></div>`;
    const images = MediaParser.extractFromPageHtml(html, baseUrl);
    expect(images).toEqual([]);
  });

  test("deduplicates fancybox hrefs", () => {
    const html = `
      <div class="flexslider">
        <ul class="slides">
          <li><a data-fancybox="gallery" href="https://www.presidenri.go.id/uploads/photo.jpg"><img src="thumb.jpg" /></a></li>
          <li><a data-fancybox="gallery" href="https://www.presidenri.go.id/uploads/photo.jpg"><img src="thumb.jpg" /></a></li>
        </ul>
      </div>
    `;
    const images = MediaParser.extractFromPageHtml(html, baseUrl);
    expect(images).toHaveLength(1);
  });
});
