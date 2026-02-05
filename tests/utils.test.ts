import { describe, expect, test } from "bun:test";
import { parseCookieFileContent, sanitize } from "../src/utils";

describe("Utils: sanitize", () => {
  test("removes illegal filename characters", () => {
    const input = 'fi:le/name"with*chars?';
    const expected = "filenamewithchars";
    expect(sanitize(input)).toBe(expected);
  });

  test("truncates long strings", () => {
    const long = "a".repeat(200);
    expect(sanitize(long).length).toBe(100);
  });

  test("trims whitespace", () => {
    expect(sanitize("  filename  ")).toBe("filename");
  });
});

describe("Utils: parseCookieFileContent", () => {
  test("parses Netscape format", () => {
    const netscape = `# Netscape HTTP Cookie File
.example.com\tTRUE\t/\tFALSE\t1234567890\tname\tvalue
.google.com\tTRUE\t/\tTRUE\t0\tfoo\tbar`;

    const expected = "name=value; foo=bar";
    expect(parseCookieFileContent(netscape)).toBe(expected);
  });

  test("parses standard header format", () => {
    const input = "Cookie: name=value; foo=bar";
    expect(parseCookieFileContent(input)).toBe("name=value; foo=bar");
  });

  test("parses raw key-value pairs", () => {
    const input = "name=value; foo=bar";
    expect(parseCookieFileContent(input)).toBe("name=value; foo=bar");
  });

  test("handles empty input", () => {
    expect(parseCookieFileContent("")).toBe("");
    expect(parseCookieFileContent("   ")).toBe("");
  });
});
