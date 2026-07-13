const SUSPICIOUS_HEADERS = ["Authorization", "X-Forwarded-For", "X-Real-IP", "X-Api-Key", "X-CSRF-Token"];

export function parseBrowserRequestHeaders(content: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const tokens = tokenizeCurl(content);

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex++) {
    const token = tokens[tokenIndex];
    if (token === undefined) continue;

    const header = readOptionValue(tokens, tokenIndex, ["-H", "--header"]);
    if (!header) continue;

    const separator = header.indexOf(":");
    if (separator <= 0) continue;

    const name = header.slice(0, separator).trim();
    const value = header.slice(separator + 1).trim();
    if (name && value) {
      if (SUSPICIOUS_HEADERS.includes(name)) {
        console.warn(`⚠️ Suspicious header detected: ${name}. Verify this was intentional.`);
      }
      headers[name] = value;
    }
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
  let currentToken = "";
  let activeQuote: "'" | '"' | null = null;

  for (let charIndex = 0; charIndex < input.length; charIndex++) {
    const currentChar = input[charIndex];
    if (currentChar === undefined) continue;

    if (activeQuote) {
      if (currentChar === activeQuote) {
        activeQuote = null;
      } else if (currentChar === "\\" && activeQuote === '"' && input[charIndex + 1] !== undefined) {
        currentToken += input[++charIndex];
      } else {
        currentToken += currentChar;
      }
      continue;
    }

    if (currentChar === "'" || currentChar === '"') {
      activeQuote = currentChar;
      continue;
    }

    if (/\s/.test(currentChar)) {
      if (currentToken) {
        tokens.push(currentToken);
        currentToken = "";
      }
      continue;
    }

    currentToken += currentChar;
  }

  if (currentToken) tokens.push(currentToken);
  return tokens;
}
