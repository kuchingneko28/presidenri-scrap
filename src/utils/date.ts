/** Branded type representing a string formatted as YYYY-MM-DDTHH:mm:ss */
export type ISODateString = string & { readonly __brand: unique symbol };

const MONTH_MAP: Readonly<Record<string, string>> = {
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

export function parseDate(str: string | null): ISODateString | null {
  if (!str) return null;
  const clean = str.replace(/WIB|WITA|WIT/g, "").trim();

  const datePart = (clean.includes(",") ? clean.split(",")[1] : clean)?.trim();
  if (!datePart) return null;

  const [dayString, monthName, year, time = "00:00"] = datePart.split(" ");
  if (!dayString || !monthName) return null;

  const monthCode = MONTH_MAP[monthName];
  if (!monthCode) return null;

  const resolvedYear = year || String(new Date().getFullYear());
  const resolvedDay = dayString.padStart(2, "0");

  return `${resolvedYear}-${monthCode}-${resolvedDay}T${time}:00` as ISODateString;
}
