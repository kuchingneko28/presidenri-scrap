import { existsSync, watch, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { BROWSER_REQUEST_FILE, DEFAULT_HEADERS } from "../config";

export function parseBrowserRequestHeaders(content: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const tokens = tokenizeCurl(content);

  for (let i = 0; i < tokens.length; i++) {
    const header = readOptionValue(tokens, i, ["-H", "--header"]);
    if (!header) continue;

    const separator = header.indexOf(":");
    if (separator <= 0) continue;

    const name = header.slice(0, separator).trim().toLowerCase();
    const value = header.slice(separator + 1).trim();
    if (name && value) {
      headers[name] = value;
    }
  }

  const cookie = readLastOptionValue(tokens, ["-b", "--cookie"]);
  if (cookie && cookie.includes("=") && !headers["cookie"]) {
    headers["cookie"] = cookie;
  }

  const userAgent = readLastOptionValue(tokens, ["-A", "--user-agent"]);
  if (userAgent && !headers["user-agent"]) {
    headers["user-agent"] = userAgent;
  }

  if (headers["referer"] && headers["referer"].includes("__cf_chl_tk")) {
    headers["referer"] = "https://www.presidenri.go.id/";
  }

  return headers;
}

export function findHeader(headers: Record<string, string>, name: string): string | undefined {
  const target = name.toLowerCase();
  const match = Object.entries(headers).find(([k]) => k.toLowerCase() === target);
  return match?.[1];
}

export async function loadHeadersFromFile(filePath: string = BROWSER_REQUEST_FILE): Promise<Record<string, string>> {
  const normalizedDefaults: Record<string, string> = {};
  for (const [k, v] of Object.entries(DEFAULT_HEADERS)) {
    normalizedDefaults[k.toLowerCase()] = v;
  }

  if (!existsSync(filePath)) {
    return normalizedDefaults;
  }

  try {
    const content = await readFile(filePath, "utf8");
    const parsed = parseBrowserRequestHeaders(content);
    return Object.keys(parsed).length > 0 ? { ...normalizedDefaults, ...parsed } : normalizedDefaults;
  } catch {
    return normalizedDefaults;
  }
}

export function watchForFileUpdate(filePath: string = BROWSER_REQUEST_FILE, timeoutMs = 300_000): Promise<boolean> {
  if (!existsSync(filePath)) return Promise.resolve(false);

  return new Promise<boolean>((resolve) => {
    let initialMtime = 0;
    try {
      initialMtime = statSync(filePath).mtimeMs;
    } catch {}

    const dir = path.dirname(filePath);
    const filename = path.basename(filePath);

    let resolved = false;
    let watcher: ReturnType<typeof watch> | undefined;

    const cleanup = () => {
      if (watcher) {
        try {
          watcher.close();
        } catch {}
      }
    };

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(false);
      }
    }, timeoutMs);

    try {
      watcher = watch(dir, async (_eventType, changedFile) => {
        if (changedFile && changedFile !== filename) return;
        if (!existsSync(filePath)) return;

        try {
          const currentMtime = statSync(filePath).mtimeMs;
          if (currentMtime > initialMtime) {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              cleanup();
              resolve(true);
            }
          }
        } catch {}
      });
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
}

function readLastOptionValue(tokens: string[], names: string[]): string | undefined {
  let value: string | undefined;
  for (let i = 0; i < tokens.length; i++) {
    value = readOptionValue(tokens, i, names) ?? value;
  }
  return value;
}

function readOptionValue(tokens: string[], index: number, names: string[]): string | undefined {
  const token = tokens[index];
  if (token === undefined) return undefined;

  for (const name of names) {
    if (token === name) return tokens[index + 1];
    if (token.startsWith(`${name}=`)) return token.slice(name.length + 1);
  }

  return undefined;
}

function tokenizeCurl(content: string): string[] {
  const input = content.replace(/\\\r?\n/g, " ");
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (!ch) continue;

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else if (ch === "\\" && quote === '"' && input[i + 1] !== undefined) {
        current += input[++i];
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }

    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += ch;
  }

  if (current) tokens.push(current);
  return tokens;
}
