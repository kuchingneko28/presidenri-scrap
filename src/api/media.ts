import { DOMAIN, WWW_DOMAIN, BETA_DOMAIN } from "../config";

/**
 * Normalizes an image URL:
 * standardizes domain to www.presidenri.go.id, normalizes path prefix,
 * and strips WordPress image dimensions suffixes (-NNNxNNN).
 */
export function normalizeImageUrl(url: string): string {
  let clean = url.trim();
  if (clean.includes(BETA_DOMAIN)) {
    clean = clean.replace(BETA_DOMAIN, WWW_DOMAIN);
  } else if (clean.includes(DOMAIN) && !clean.includes("www.")) {
    clean = clean.replace(DOMAIN, WWW_DOMAIN);
  }
  clean = clean.replace("/assets/uploads/", "/uploads/");

  // Strip WordPress resize suffixes (-1024x768, -512x341)
  const stripDimSuffix = (s: string) => s.replace(/-(\d+x\d+)(\.[a-z0-9]+)$/i, "$2");
  let prev: string;
  do {
    prev = clean;
    clean = stripDimSuffix(clean);
  } while (clean !== prev);

  return clean;
}

/**
 * Generates candidate URLs for downloading an image.
 * Prioritizes the original normalized source_url first, followed by scaled/unscaled variations.
 */
export function generateCandidateUrls(originalUrl: string): string[] {
  const candidates: string[] = [];
  const add = (u: string) => {
    if (u && !candidates.includes(u)) candidates.push(u);
  };

  const normalized = normalizeImageUrl(originalUrl);
  // 1. Original normalized URL first (e.g. -scaled if uploaded as scaled)
  add(normalized);

  // 2. If it has -scaled, try unscaled; if unscaled, try -scaled
  if (normalized.includes("-scaled.")) {
    add(normalized.replace("-scaled.", "."));
  } else {
    add(normalized.replace(/(\.[a-z0-9]+)$/i, "-scaled$1"));
  }

  // 3. Fallback to raw original URL if different
  let raw = originalUrl.trim();
  if (raw.includes(BETA_DOMAIN)) raw = raw.replace(BETA_DOMAIN, WWW_DOMAIN);
  else if (raw.includes(DOMAIN) && !raw.includes("www.")) raw = raw.replace(DOMAIN, WWW_DOMAIN);
  raw = raw.replace("/assets/uploads/", "/uploads/");
  add(raw);

  return candidates;
}

/**
 * Strips HTML entity codes (e.g. &#8211;, &#038;, &amp;, &quot;) and converts them to plain text.
 */
export function decodeHtmlEntities(str: string): string {
  const entityMap: Record<string, string> = {
    "&amp;": "&",
    "&#038;": "&",
    "&quot;": '"',
    "&#8220;": '"',
    "&#8221;": '"',
    "&#8216;": "'",
    "&#8217;": "'",
    "&#8211;": "–",
    "&#8212;": "—",
    "&lt;": "<",
    "&gt;": ">",
    "&nbsp;": " ",
    "&#8230;": "...",
  };

  let decoded = str;
  for (const [entity, replacement] of Object.entries(entityMap)) {
    decoded = decoded.replaceAll(entity, replacement);
  }

  // Decimal entity fallback &#NNN;
  decoded = decoded.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)));
  return decoded;
}

/**
 * Sanitizes a title string into a safe directory or filename.
 * Removes forbidden OS characters, strips illegal punctuation, collapses spaces to underscores,
 * and clamps length to 80 chars to avoid filesystem PATH_MAX limits.
 */
export function sanitizeFilename(title: string, maxLength: number = 80): string {
  const decoded = decodeHtmlEntities(title);
  let sanitized = decoded
    .trim()
    .replace(/[<>:"/\\|?*]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength).replace(/_+$/, "");
  }

  return sanitized || "untitled";
}
