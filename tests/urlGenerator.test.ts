import { describe, expect, test } from "bun:test";
import { UrlGenerator } from "../src/utils/UrlGenerator";

describe("UrlGenerator", () => {
  test("forces www domain to prevent tarpitting", () => {
    const urls = UrlGenerator.generateCandidates("https://presidenri.go.id/image.jpg");
    expect(urls).toContain("https://www.presidenri.go.id/image.jpg");
    expect(urls).not.toContain("https://presidenri.go.id/image.jpg");
  });

  test("generates path variations for assets/uploads", () => {
    const urls = UrlGenerator.generateCandidates("https://www.presidenri.go.id/assets/uploads/image.jpg");
    expect(urls).toContain("https://www.presidenri.go.id/assets/uploads/image.jpg");
    expect(urls).toContain("https://www.presidenri.go.id/uploads/image.jpg");
    expect(urls).toContain("https://www.presidenri.go.id/wp-content/uploads/image.jpg");
  });

  test("strips standard size suffixes", () => {
    const urls = UrlGenerator.generateCandidates("https://www.presidenri.go.id/uploads/image-1024x768.jpg");
    expect(urls).toContain("https://www.presidenri.go.id/uploads/image-1024x768.jpg");
    expect(urls).toContain("https://www.presidenri.go.id/uploads/image.jpg");
  });

  test("strips -scaled suffixes", () => {
    const urls = UrlGenerator.generateCandidates("https://www.presidenri.go.id/uploads/photo-scaled.jpeg");
    expect(urls).toContain("https://www.presidenri.go.id/uploads/photo-scaled.jpeg");
    expect(urls).toContain("https://www.presidenri.go.id/uploads/photo.jpeg");
  });

  test("strips recursive suffixes including -scaled", () => {
    const urls = UrlGenerator.generateCandidates("https://www.presidenri.go.id/uploads/pic-scaled-1024x768.png");
    expect(urls).toContain("https://www.presidenri.go.id/uploads/pic-scaled-1024x768.png");
    expect(urls).toContain("https://www.presidenri.go.id/uploads/pic-scaled.png");
    expect(urls).toContain("https://www.presidenri.go.id/uploads/pic.png");
  });

  test("strips -scaled to get original full-res (WP 5.3+ keeps original, creates -scaled)", () => {
    const urls = UrlGenerator.generateCandidates("https://www.presidenri.go.id/uploads/photo-scaled.jpg");
    expect(urls).toContain("https://www.presidenri.go.id/uploads/photo-scaled.jpg");
    expect(urls).toContain("https://www.presidenri.go.id/uploads/photo.jpg");
  });

  test("strips -e{number} cache-buster and -scaled", () => {
    const urls = UrlGenerator.generateCandidates("https://www.presidenri.go.id/uploads/photo-scaled-e123456789.jpeg");
    expect(urls).toContain("https://www.presidenri.go.id/uploads/photo-scaled-e123456789.jpeg");
    expect(urls).toContain("https://www.presidenri.go.id/uploads/photo-scaled.jpeg");
    expect(urls).toContain("https://www.presidenri.go.id/uploads/photo.jpeg");
  });

  test("generates candidates for non-www URL", () => {
    const urls = UrlGenerator.generateCandidates("https://presidenri.go.id/uploads/image.jpg");
    expect(urls[0]).toBe("https://www.presidenri.go.id/uploads/image.jpg");
    expect(urls).not.toContain("https://presidenri.go.id/uploads/image.jpg");
  });
});
