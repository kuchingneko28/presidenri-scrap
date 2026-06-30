import { BROWSER_REQUEST_FILE } from "../config/constants";
import { HEADERS } from "../config/headers";

export function parseDate(str: string | null): string | null {
  if (!str) return null;
  const clean = str.replace(/WIB|WITA|WIT/g, "").trim();
  const monthMap: Record<string, string> = {
    Januari: "01", Februari: "02", Maret: "03", April: "04", Mei: "05", Juni: "06",
    Juli: "07", Agustus: "08", September: "09", Oktober: "10", November: "11", Desember: "12",
  };

  const datePart = (clean.includes(",") ? clean.split(",")[1] : clean)?.trim();
  if (!datePart) return null;

  const [day, monthName, year, time = "00:00"] = datePart.split(" ");
  if (!day || !monthName || !monthMap[monthName]) return null;

  return `${year || new Date().getFullYear()}-${monthMap[monthName]}-${day.padStart(2, "0")}T${time}:00`;
}

export function sanitize(name: string): string {
  const sanitized = name
    .replace(/[<>:"/\\|?*]+/g, "")
    .substring(0, 100)
    .trim();
  return sanitized || "untitled";
}

export function parseBrowserRequestHeaders(
  content: string,
): Record<string, string> {
  const headers: Record<string, string> = {};

  const tokens = tokenizeCurl(content);
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
    const token = tokens[tokenIndex];
    if (!token) continue;

    const header = readOptionValue(tokens, tokenIndex, ["-H", "--header"]);
    if (!header) continue;

    const separator = header.indexOf(":");
    if (separator <= 0) continue;

    const name = header.slice(0, separator).trim();
    const value = header.slice(separator + 1).trim();
    if (name && value) headers[name] = value;
  }

  const cookie = readLastOptionValue(tokens, ["-b", "--cookie"]);
  if (cookie && cookie.includes("=") && !findHeader(headers, "cookie")) {
    headers.Cookie = cookie;
  }

  const userAgent = readLastOptionValue(tokens, ["-A", "--user-agent"]);
  if (userAgent && !findHeader(headers, "user-agent")) {
    headers["User-Agent"] = userAgent;
  }

  return headers;
}

export function findHeader(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const match = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return match?.[1];
}

function readLastOptionValue(
  tokens: string[],
  names: string[],
): string | undefined {
  let value: string | undefined;
  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
    value = readOptionValue(tokens, tokenIndex, names) ?? value;
  }
  return value;
}

function readOptionValue(
  tokens: string[],
  index: number,
  names: string[],
): string | undefined {
  const token = tokens[index];
  if (!token) return undefined;

  for (const name of names) {
    if (token === name) return tokens[index + 1];
    if (token.startsWith(`${name}=`)) return token.slice(name.length + 1);
  }

  return undefined;
}

function tokenizeCurl(content: string): string[] {
  const input = content.replace(/\\\r?\n/g, " ");
  const tokens: string[] = [];
  let token = "";
  let quote: "'" | '"' | null = null;

  for (let charIndex = 0; charIndex < input.length; charIndex++) {
    const char = input[charIndex];
    if (!char) continue;

    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (char === "\\" && quote === '"' && input[charIndex + 1]) {
        token += input[++charIndex];
      } else {
        token += char;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }

    if (/\s/.test(char)) {
      if (token) {
        tokens.push(token);
        token = "";
      }
      continue;
    }

    token += char;
  }

  if (token) tokens.push(token);
  return tokens;
}

export function decodeHtmlEntities(text: string): string {
  const NAMED_ENTITIES: Record<string, string> = {
    "&amp;": "&",
    "&quot;": '"',
    "&apos;": "'",
    "&lt;": "<",
    "&gt;": ">",
    "&nbsp;": " ",
    "&ndash;": "–",
    "&mdash;": "—",
    "&lsquo;": "‘",
    "&rsquo;": "’",
    "&ldquo;": "“",
    "&rdquo;": "”",
  };

  let decoded = text.replace(/&[a-zA-Z0-9]+;/g, (match) => NAMED_ENTITIES[match] || match);
  
  decoded = decoded.replace(/&#([0-9]+);/g, (_, dec) => {
    try {
      return String.fromCodePoint(parseInt(dec, 10));
    } catch {
      return "";
    }
  });

  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try {
      return String.fromCodePoint(parseInt(hex, 16));
    } catch {
      return "";
    }
  });

  return decoded;
}

export function parseIntOrUndefined(val: unknown): number | undefined {
  if (val === undefined || val === null || val === "") return undefined;
  const parsed = parseInt(String(val), 10);
  return isNaN(parsed) ? undefined : parsed;
}

export function validatePositiveInteger(val: unknown, name: string): number | undefined {
  const parsed = parseIntOrUndefined(val);
  if (parsed !== undefined) {
    if (parsed <= 0) {
      throw new Error(`Option --${name} must be a positive integer.`);
    }
  }
  return parsed;
}

export function validateDateFormat(val: unknown, name: string): string | undefined {
  if (val === undefined || val === null || val === "") return undefined;
  const str = String(val);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    throw new Error(`Option --${name} must be in YYYY-MM-DD format.`);
  }
  const date = new Date(str);
  if (isNaN(date.getTime())) {
    throw new Error(`Option --${name} must be a valid date.`);
  }
  return str;
}
