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
  return name
    .replace(/[<>:"/\\|?*]+/g, "")
    .substring(0, 100)
    .trim();
}

export function parseBrowserRequestHeaders(
  content: string,
): Record<string, string> {
  const headers: Record<string, string> = {};

  const tokens = tokenizeCurl(content);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!token) continue;

    const header = readOptionValue(tokens, i, ["-H", "--header"]);
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
  for (let i = 0; i < tokens.length; i++) {
    value = readOptionValue(tokens, i, names) ?? value;
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

  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (!char) continue;

    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (char === "\\" && quote === '"' && input[i + 1]) {
        token += input[++i];
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
  return text
    .replace(/&#8211;/g, "–")
    .replace(/&#8217;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}
