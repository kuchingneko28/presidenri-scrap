export function parseDate(str: string | null): string | null {
  if (!str) return null;
  // Example format: "15, Januari 2026" or "Senin, 15 Januari 2026 10:00 WIB"
  // Needs to return YYYY-MM-DD string or ISO date string for DB

  // Clean up WIB/WITA/WIT and extra chars
  const clean = str.replace(/WIB|WITA|WIT/g, "").trim();
  // Helper map
  const m: Record<string, string> = {
    Januari: "01",
    Februari: "02",
    Maret: "03",
    April: "04",
    Mei: "05",
    Juni: "06",
    Juli: "07",
    Agustus: "08",
    September: "09",
    Oktober: "10",
    November: "11",
    Desember: "12",
  };

  // Try to extract date parts
  // Split by comma often helps if format is "DayName, DD Month YYYY"
  const parts = clean.split(",");
  const part = parts.length > 1 ? parts[1] : parts[0];
  const datePart = part ? part.trim() : "";

  if (!datePart) return null;

  const p = datePart.split(" "); // [15, Januari, 2026]

  if (p.length >= 3) {
    const day = p[0] ? p[0].padStart(2, "0") : "01";
    const monthName = p[1];
    if (!monthName || !m[monthName]) return null;

    const month = m[monthName];
    const year = p[2] || new Date().getFullYear().toString();
    const time = p[3] || "00:00";

    return `${year}-${month}-${day}T${time}:00`;
  }
  return null;
}

export function sanitize(s: string): string {
  return s
    .replace(/[<>:"/\\|?*]+/g, "")
    .substring(0, 100)
    .trim();
}

export function parseCookieFileContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "";

  // Check for Netscape format (lines starting with # or containing tabs)
  if (trimmed.startsWith("#") || trimmed.includes("\t")) {
    return trimmed
      .split("\n")
      .filter((line) => line.trim() && !line.startsWith("#"))
      .map((line) => {
        const parts = line.split("\t");
        // Netscape format: domain, flag, path, secure, expiration, name, value
        if (parts.length >= 7) {
          const value = parts[6] || "";
          return `${parts[5]}=${value.trim()}`;
        }
        return null;
      })
      .filter(Boolean)
      .join("; ");
  }

  // Assume raw header string (key=value; key2=value2)
  // Remove "Cookie: " prefix if present
  return trimmed.replace(/^Cookie:\s*/i, "").trim();
}
