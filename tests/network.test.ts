import { describe, expect, test, afterAll, beforeAll } from "bun:test";
import { unlink } from "node:fs/promises";
import { BROWSER_REQUEST_FILE } from "../src/config/constants";
import { NetworkService } from "../src/services/NetworkService";
import { LoggerService } from "../src/services/LoggerService";
import type { Server } from "bun";

describe("NetworkService - 403 Hot Reload Integration", () => {
  let originalCurlContent: string | null = null;
  let server: Server<unknown> | undefined;
  let port: number;

  beforeAll(async () => {
    // Backup original curl file if exists
    const file = Bun.file(BROWSER_REQUEST_FILE);
    if (await file.exists()) {
      originalCurlContent = await file.text();
    }

    // Start a local test server
    server = Bun.serve({
      port: 0, // Bind to random open port
      fetch(req) {
        const url = new URL(req.url);
        if (url.pathname === "/test") {
          const freshHeader = req.headers.get("x-fresh-header");
          if (freshHeader === "yes") {
            return new Response("Success!", { status: 200 });
          } else {
            return new Response("Forbidden", { status: 403 });
          }
        }
        return new Response("Not Found", { status: 404 });
      },
    });
    if (!server) {
      throw new Error("Server failed to start");
    }
    port = server.port ?? 0;
  });

  afterAll(async () => {
    // Close server
    if (server) {
      server.stop();
    }

    // Restore original curl file
    if (originalCurlContent !== null) {
      await Bun.write(BROWSER_REQUEST_FILE, originalCurlContent);
    } else {
      try {
        await unlink(BROWSER_REQUEST_FILE);
      } catch (e) {}
    }
  });

  test("should detect header file update on 403 and retry successfully", async () => {
    const logger = new LoggerService();
    const network = new NetworkService(logger);

    // 1. Write initial headers (no x-fresh-header)
    await Bun.write(
      BROWSER_REQUEST_FILE,
      `curl 'http://localhost:${port}/test' -H 'Accept: text/html'`
    );
    await network.refreshHeaders();

    // 2. Start fetch in background (will block on 403 and wait for file update)
    const fetchPromise = network.fetch(`http://localhost:${port}/test`, {}, 1);

    // 3. Wait a moment, then write updated headers (with x-fresh-header)
    await new Promise((r) => setTimeout(r, 1500));
    await Bun.write(
      BROWSER_REQUEST_FILE,
      `curl 'http://localhost:${port}/test' -H 'Accept: text/html' -H 'X-Fresh-Header: yes'`
    );

    // 4. Await the response and verify it succeeded
    const response = await fetchPromise;
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Success!");
  }, 10000); // 10s timeout
});
