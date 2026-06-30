import { describe, expect, test } from "bun:test";
import { decodeHtmlEntities, sanitize, parseBrowserRequestHeaders } from "../src/utils";

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
});
