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

  test("strips recursive suffixes", () => {
    const urls = UrlGenerator.generateCandidates("https://www.presidenri.go.id/uploads/pic-scaled-1024x768.png");
    expect(urls).toContain("https://www.presidenri.go.id/uploads/pic-scaled-1024x768.png");
    expect(urls).toContain("https://www.presidenri.go.id/uploads/pic-scaled.png");
    expect(urls).toContain("https://www.presidenri.go.id/uploads/pic.png");
  });
});
