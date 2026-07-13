import { MAX_FILENAME_LENGTH } from "../config/constants";

export function sanitize(name: string): string {
  const sanitized = name
    .replace(/[<>:"/\\|?*]+/g, "")
    .substring(0, MAX_FILENAME_LENGTH)
    .trim();
  return sanitized || "untitled";
}
