const NAMED_ENTITIES: Readonly<Record<string, string>> = Object.freeze({
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
});

export function decodeHtmlEntities(text: string): string {
  let decoded = text.replace(/&[a-zA-Z0-9]+;/g, (match) => NAMED_ENTITIES[match] ?? match);
  
  decoded = decoded.replace(/&#([0-9]+);/g, (_, dec: string) => {
    try {
      return String.fromCodePoint(parseInt(dec, 10));
    } catch {
      return "";
    }
  });

  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
    try {
      return String.fromCodePoint(parseInt(hex, 16));
    } catch {
      return "";
    }
  });

  return decoded;
}
