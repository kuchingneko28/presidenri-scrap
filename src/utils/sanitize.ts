export function sanitize(name: string): string {
  const sanitized = name
    .replace(/[<>:"/\\|?*]+/g, "")
    .substring(0, 100)
    .trim();
  return sanitized || "untitled";
}
