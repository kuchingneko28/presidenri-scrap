import { describe, expect, test } from "bun:test";
import { parseDate } from "../src/utils";
import type { ISODateString } from "../src/utils/date";

describe("Date Parser", () => {
  test("parses standard format (DayName, DD Month YYYY)", () => {
    const raw = "Senin, 9 Desember 2019 16:31 WIB";
    expect(parseDate(raw)).toBe("2019-12-09T16:31:00" as ISODateString);
  });

  test("parses format without day name (DD Month YYYY)", () => {
    const raw = "9 Desember 2019 16:31 WIB";
    expect(parseDate(raw)).toBe("2019-12-09T16:31:00" as ISODateString);
  });

  test("handles single digit days", () => {
    const raw = "Senin, 1 Januari 2024 10:00 WIB";
    expect(parseDate(raw)).toBe("2024-01-01T10:00:00" as ISODateString);
  });

  test("handles all months", () => {
    expect(parseDate("1 Januari 2024")).toContain("-01-");
    expect(parseDate("1 Februari 2024")).toContain("-02-");
    expect(parseDate("1 Maret 2024")).toContain("-03-");
    expect(parseDate("1 April 2024")).toContain("-04-");
    expect(parseDate("1 Mei 2024")).toContain("-05-");
    expect(parseDate("1 Juni 2024")).toContain("-06-");
    expect(parseDate("1 Juli 2024")).toContain("-07-");
    expect(parseDate("1 Agustus 2024")).toContain("-08-");
    expect(parseDate("1 September 2024")).toContain("-09-");
    expect(parseDate("1 Oktober 2024")).toContain("-10-");
    expect(parseDate("1 November 2024")).toContain("-11-");
    expect(parseDate("1 Desember 2024")).toContain("-12-");
  });

  test("returns null for invalid strings", () => {
    expect(parseDate("Invalid Date")).toBeNull();
    expect(parseDate("")).toBeNull();
    expect(parseDate(null)).toBeNull();
  });
});
