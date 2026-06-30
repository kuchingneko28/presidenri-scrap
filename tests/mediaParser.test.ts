import { describe, expect, test } from "bun:test";
import { MediaParser } from "../src/utils/MediaParser";

describe("MediaParser", () => {
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
});
