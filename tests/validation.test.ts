import { describe, expect, test } from "bun:test";
import {
  parseIntOrUndefined,
  validatePositiveInteger,
  validateNonNegativeInteger,
  validateDateFormat,
} from "../src/utils/validation";

describe("parseIntOrUndefined", () => {
  test("returns undefined for undefined, null, empty string", () => {
    expect(parseIntOrUndefined(undefined)).toBeUndefined();
    expect(parseIntOrUndefined(null)).toBeUndefined();
    expect(parseIntOrUndefined("")).toBeUndefined();
  });

  test("parses valid integers", () => {
    expect(parseIntOrUndefined(42)).toBe(42);
    expect(parseIntOrUndefined("100")).toBe(100);
    expect(parseIntOrUndefined("0")).toBe(0);
    expect(parseIntOrUndefined("-5")).toBe(-5);
  });

  test("returns undefined for non-numeric strings", () => {
    expect(parseIntOrUndefined("abc")).toBeUndefined();
    expect(parseIntOrUndefined("12.5")).toBe(12);
    expect(parseIntOrUndefined("12abc")).toBe(12);
  });
});

describe("validatePositiveInteger", () => {
  test("returns undefined for undefined input", () => {
    expect(validatePositiveInteger(undefined, "limit")).toBeUndefined();
  });

  test("returns the value for positive integers", () => {
    expect(validatePositiveInteger(5, "limit")).toBe(5);
    expect(validatePositiveInteger("10", "page")).toBe(10);
  });

  test("throws for zero", () => {
    expect(() => validatePositiveInteger(0, "limit")).toThrow("Option --limit must be a positive integer.");
  });

  test("throws for negative integers", () => {
    expect(() => validatePositiveInteger(-1, "page")).toThrow("Option --page must be a positive integer.");
  });
});

describe("validateNonNegativeInteger", () => {
  test("returns undefined for undefined input", () => {
    expect(validateNonNegativeInteger(undefined, "offset")).toBeUndefined();
  });

  test("returns the value for non-negative integers", () => {
    expect(validateNonNegativeInteger(0, "offset")).toBe(0);
    expect(validateNonNegativeInteger(5, "offset")).toBe(5);
  });

  test("throws for negative integers", () => {
    expect(() => validateNonNegativeInteger(-1, "offset")).toThrow("Option --offset must be a non-negative integer.");
  });
});

describe("validateDateFormat", () => {
  test("returns undefined for undefined input", () => {
    expect(validateDateFormat(undefined, "since")).toBeUndefined();
  });

  test("returns the string for valid dates", () => {
    expect(validateDateFormat("2024-01-15", "since")).toBe("2024-01-15");
  });

  test("throws for invalid format", () => {
    expect(() => validateDateFormat("15-01-2024", "since")).toThrow("Option --since must be in YYYY-MM-DD format.");
    expect(() => validateDateFormat("2024/01/15", "since")).toThrow("Option --since must be in YYYY-MM-DD format.");
  });

  test("throws for invalid date", () => {
    expect(() => validateDateFormat("2024-13-45", "since")).toThrow("Option --since must be a valid date.");
  });
});
