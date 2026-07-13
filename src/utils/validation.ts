export function parseIntOrUndefined(inputValue: unknown): number | undefined {
  if (inputValue === undefined || inputValue === null || inputValue === "") return undefined;
  const parsed = parseInt(String(inputValue), 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function validatePositiveInteger(inputValue: unknown, name: string): number | undefined {
  const parsed = parseIntOrUndefined(inputValue);
  if (parsed !== undefined) {
    if (parsed <= 0) {
      throw new Error(`Option --${name} must be a positive integer.`);
    }
  }
  return parsed;
}

export function validateNonNegativeInteger(inputValue: unknown, name: string): number | undefined {
  const parsed = parseIntOrUndefined(inputValue);
  if (parsed !== undefined) {
    if (parsed < 0) {
      throw new Error(`Option --${name} must be a non-negative integer.`);
    }
  }
  return parsed;
}

export function validateDateFormat(inputValue: unknown, name: string): string | undefined {
  if (inputValue === undefined || inputValue === null || inputValue === "") return undefined;
  const str = String(inputValue);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    throw new Error(`Option --${name} must be in YYYY-MM-DD format.`);
  }
  const date = new Date(str);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Option --${name} must be a valid date.`);
  }
  return str;
}
