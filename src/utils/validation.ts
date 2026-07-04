/** Branded format for a simple YYYY-MM-DD date string */
export type DateString = string & { readonly __brand: unique symbol };

export function parseIntOrUndefined(val: unknown): number | undefined {
  if (val === undefined || val === null || val === "") return undefined;
  const parsed = parseInt(String(val), 10);
  return Number.isNaN(parsed) ? undefined : parsed;
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

export function validateDateFormat(val: unknown, name: string): DateString | undefined {
  if (val === undefined || val === null || val === "") return undefined;
  const str = String(val);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    throw new Error(`Option --${name} must be in YYYY-MM-DD format.`);
  }
  const date = new Date(str);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Option --${name} must be a valid date.`);
  }
  return str as DateString;
}
