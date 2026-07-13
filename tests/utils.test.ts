import { describe, expect, test } from "bun:test";
import { decodeHtmlEntities, sanitize, parseBrowserRequestHeaders } from "../src/utils";
import { findHeader } from "../src/utils/curl";

describe("Utils - decodeHtmlEntities", () => {
  test("should decode named entities", () => {
    expect(decodeHtmlEntities("&amp; &quot; &apos; &lt; &gt; &nbsp; &ndash; &mdash; &lsquo; &rsquo; &ldquo; &rdquo;"))
      .toBe("& \" ' < >   – — ‘ ’ “ ”");
  });

  test("should decode decimal numeric entities", () => {
    expect(decodeHtmlEntities("&#38; &#60; &#62;")).toBe("& < >");
  });

  test("should decode hexadecimal numeric entities", () => {
    expect(decodeHtmlEntities("&#x26; &#x3c; &#x3e;")).toBe("& < >");
  });

  test("should handle invalid entities gracefully", () => {
    expect(decodeHtmlEntities("&#invalid; &#xinvalid; &invalid;")).toBe("&#invalid; &#xinvalid; &invalid;");
  });
});

describe("Utils - sanitize", () => {
  test("should remove invalid characters", () => {
    expect(sanitize("Hello: World? *")).toBe("Hello World");
  });

  test("should return untitled for empty string", () => {
    expect(sanitize("")).toBe("untitled");
    expect(sanitize("?*:")).toBe("untitled");
  });
});

describe("Utils - parseBrowserRequestHeaders", () => {
  test("should parse simple headers", () => {
    const curl = "curl 'http://example.com' -H 'Accept: text/html' -H 'X-Test: yes'";
    const headers = parseBrowserRequestHeaders(curl);
    expect(headers["Accept"]).toBe("text/html");
    expect(headers["X-Test"]).toBe("yes");
  });

  test("should parse cookie option", () => {
    const curl = "curl 'http://example.com' -b 'foo=bar'";
    const headers = parseBrowserRequestHeaders(curl);
    expect(headers["Cookie"]).toBe("foo=bar");
  });

  test("should parse user-agent option", () => {
    const curl = "curl 'http://example.com' -A 'Mozilla/5.0'";
    const headers = parseBrowserRequestHeaders(curl);
    expect(headers["User-Agent"]).toBe("Mozilla/5.0");
  });

  test("should handle multiline curl with backslashes", () => {
    const curl = `curl 'http://example.com' \\
      -H 'Accept: text/html' \\
      -H 'X-Test: yes'`;
    const headers = parseBrowserRequestHeaders(curl);
    expect(headers["Accept"]).toBe("text/html");
    expect(headers["X-Test"]).toBe("yes");
  });

  test("should parse double-quoted values", () => {
    const curl = `curl 'http://example.com' -H "Accept: application/json"`;
    const headers = parseBrowserRequestHeaders(curl);
    expect(headers["Accept"]).toBe("application/json");
  });

  test("should handle --header long form", () => {
    const curl = `curl 'http://example.com' --header 'X-Custom: value'`;
    const headers = parseBrowserRequestHeaders(curl);
    expect(headers["X-Custom"]).toBe("value");
  });

  test("should handle -H=value form", () => {
    const curl = `curl 'http://example.com' -H=foo:bar`;
    const headers = parseBrowserRequestHeaders(curl);
    expect(headers["foo"]).toBe("bar");
  });

  test("should handle empty curl gracefully", () => {
    const headers = parseBrowserRequestHeaders("");
    expect(Object.keys(headers)).toHaveLength(0);
  });

  test("should warn on suspicious headers", () => {
    const curl = "curl 'http://example.com' -H 'Authorization: Bearer token'";
    const headers = parseBrowserRequestHeaders(curl);
    expect(headers["Authorization"]).toBe("Bearer token");
  });

  test("should parse combined headers, cookie, and user-agent", () => {
    const curl = `curl 'http://example.com' \\
      -H 'Accept: text/html' \\
      -H 'Referer: https://example.com' \\
      -b 'session=abc123' \\
      -A 'Mozilla/5.0'`;
    const headers = parseBrowserRequestHeaders(curl);
    expect(headers["Accept"]).toBe("text/html");
    expect(headers["Referer"]).toBe("https://example.com");
    expect(headers["Cookie"]).toBe("session=abc123");
    expect(headers["User-Agent"]).toBe("Mozilla/5.0");
  });

  test("header from -H should override cookie option", () => {
    const curl = "curl 'http://example.com' -H 'Cookie: from_header=1' -b 'from_option=2'";
    const headers = parseBrowserRequestHeaders(curl);
    expect(headers["Cookie"]).toBe("from_header=1");
  });
});

describe("findHeader", () => {
  test("should find header by exact name", () => {
    expect(findHeader({ "Accept": "text/html" }, "Accept")).toBe("text/html");
  });

  test("should find header case-insensitively", () => {
    expect(findHeader({ "Content-Type": "text/html" }, "content-type")).toBe("text/html");
    expect(findHeader({ "ACCEPT": "text/html" }, "accept")).toBe("text/html");
  });

  test("should return undefined for missing header", () => {
    expect(findHeader({ "Accept": "text/html" }, "X-Missing")).toBeUndefined();
  });

  test("should return undefined for empty headers", () => {
    expect(findHeader({}, "Accept")).toBeUndefined();
  });
});

