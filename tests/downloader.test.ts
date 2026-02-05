import { describe, expect, mock, test } from "bun:test";
import { stat, writeFile } from "node:fs/promises";
import { processDownloadQueue } from "../src/core/downloader";

// Mock FS
mock.module("node:fs/promises", () => {
  const mockStat = mock(async () => {
    throw new Error("Not found");
  });
  const mockWriteFile = mock(async () => {});
  const mockMkdir = mock(async () => {});
  return {
    stat: mockStat,
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
    default: {
      stat: mockStat,
      writeFile: mockWriteFile,
      mkdir: mockMkdir,
    },
  };
});

// Mock UI
mock.module("../src/ui/display", () => {
  return {
    info: mock(() => {}),
    startSpinner: mock(() => {}),
    updateSpinner: mock(() => {}),
    stopSpinner: mock(() => {}),
    log: mock(() => {}),
    error: mock(() => {}),
  };
});

describe("Downloader", () => {
  test("should download images", async () => {
    const queue = [
      {
        title: "Test Article",
        date: "2024-01-01",
        images: ["https://example.com/img1.jpg"],
      },
    ];

    global.fetch = mock(async () => new Response("image data")) as any;

    await processDownloadQueue(queue, 1, false, {});

    expect(writeFile).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining("downloads/2024/01 - Test Article/"),
      expect.any(Buffer),
    );
  });

  test("should skip existing files", async () => {
    const queue = [
      {
        title: "Test Article",
        date: "2024-01-01",
        images: ["https://example.com/img1.jpg"],
      },
    ];

    (stat as any).mockResolvedValueOnce({}); // File exists
    (writeFile as any).mockClear();

    await processDownloadQueue(queue, 1, false, {});

    expect(writeFile).not.toHaveBeenCalled();
  });
});
