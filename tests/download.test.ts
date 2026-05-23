import { describe, expect, test } from "bun:test";
import { DownloadService } from "../src/services/DownloadService";
import { LoggerService } from "../src/services/LoggerService";
import { NetworkService } from "../src/services/NetworkService";

describe("DownloadService - readStream", () => {
  test("should successfully read all chunks from a standard stream", async () => {
    const logger = new LoggerService();
    const network = new NetworkService(logger);
    const downloadService = new DownloadService(logger, network);

    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode("Hello "),
      encoder.encode("world!"),
    ];

    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      }
    });

    // Call private method
    const result = await downloadService["readStream"](stream);
    expect(result.length).toBe(12);
    expect(result.data.length).toBe(2);

    const decoder = new TextDecoder();
    const concatenated = new Uint8Array(result.length);
    let offset = 0;
    for (const chunk of result.data) {
      concatenated.set(chunk, offset);
      offset += chunk.length;
    }
    expect(decoder.decode(concatenated)).toBe("Hello world!");
  });
});
