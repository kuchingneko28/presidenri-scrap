import { describe, it, expect } from "bun:test";
import { normalizeImageUrl, generateCandidateUrls, decodeHtmlEntities, sanitizeFilename } from "../src/api/media";

describe("Media Utilities", () => {
  it("normalizes domain and path prefix", () => {
    expect(normalizeImageUrl("https://presidenri.go.id/uploads/2024/11/photo.jpg")).toBe(
      "https://www.presidenri.go.id/uploads/2024/11/photo.jpg"
    );
    expect(normalizeImageUrl("https://beta.presidenri.go.id/assets/uploads/2024/11/photo.jpg")).toBe(
      "https://www.presidenri.go.id/uploads/2024/11/photo.jpg"
    );
  });

  it("strips WordPress size suffixes", () => {
    expect(normalizeImageUrl("https://www.presidenri.go.id/uploads/2024/11/photo-1024x768.jpg")).toBe(
      "https://www.presidenri.go.id/uploads/2024/11/photo.jpg"
    );
    expect(normalizeImageUrl("https://www.presidenri.go.id/uploads/2024/11/photo-512x341.jpg")).toBe(
      "https://www.presidenri.go.id/uploads/2024/11/photo.jpg"
    );
  });

  it("generates candidates for image downloading", () => {
    const candidates = generateCandidateUrls("https://presidenri.go.id/uploads/2024/11/photo-1024x768.jpg");
    expect(candidates).toContain("https://www.presidenri.go.id/uploads/2024/11/photo.jpg");
    expect(candidates).toContain("https://www.presidenri.go.id/uploads/2024/11/photo-scaled.jpg");
  });

  it("decodes HTML entities properly", () => {
    expect(decodeHtmlEntities("Presiden &amp; Wakil Presiden &quot;RI&quot;")).toBe(
      'Presiden & Wakil Presiden "RI"'
    );
    expect(decodeHtmlEntities("Gedung Agung &#8211; Yogyakarta")).toBe("Gedung Agung – Yogyakarta");
  });

  it("sanitizes filenames safely", () => {
    expect(sanitizeFilename("Presiden: Kunjungan Kerja / 2024?")).toBe("Presiden_Kunjungan_Kerja_2024");
    expect(sanitizeFilename("")).toBe("untitled");
  });
});
