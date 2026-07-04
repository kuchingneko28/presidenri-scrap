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
  let token = "";
  let quote: "'" | '"' | null = null;

  for (let charIndex = 0; charIndex < input.length; charIndex++) {
    const char = input[charIndex];
    if (char === undefined) continue;

    if (quote) {
      if (char === quote) {
        quote = null;
      } else if (char === "\\" && quote === '"' && input[charIndex + 1] !== undefined) {
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
