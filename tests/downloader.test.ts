import { describe, it, expect } from "bun:test";
import { Downloader } from "../src/downloader";
import { PresidenClient } from "../src/api/client";
import path from "node:path";
import os from "node:os";

describe("Downloader", () => {
  it("computes clean target directory and filename", () => {
    const client = new PresidenClient();
    const tempDir = path.join(os.tmpdir(), `test-dl-${Date.now()}`);
    const downloader = new Downloader(client, 2, tempDir);

    const { fullPath, filename, folderName } = downloader.getTargetPath({
      title: "Kunjungan Kerja ke Jawa Barat",
      date: "2024-11-10",
      imageUrl: "https://www.presidenri.go.id/uploads/2024/11/kunjungan_01.jpg",
      index: 0,
    });

    expect(folderName).toBe("2024-11-10_Kunjungan_Kerja_ke_Jawa_Barat");
    expect(filename).toBe("kunjungan_01.jpg");
    expect(fullPath).toContain("2024-11-10_Kunjungan_Kerja_ke_Jawa_Barat");
    expect(fullPath).toContain("kunjungan_01.jpg");
  });

  it("handles dry-run mode without errors", async () => {
    const client = new PresidenClient();
    const tempDir = path.join(os.tmpdir(), `test-dl-dryrun-${Date.now()}`);
    const downloader = new Downloader(client, 2, tempDir);

    await downloader.download(
      {
        title: "Test Article",
        date: "2024-11-10",
        imageUrl: "https://www.presidenri.go.id/uploads/2024/11/photo.jpg",
        index: 0,
      },
      false,
      true
    );

    const stats = downloader.getStats();
    expect(stats.downloaded).toBe(1);
    expect(stats.failed).toBe(0);
  });
});
