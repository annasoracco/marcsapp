// All number formatting for the UI lives here.
//
// PRIVACY RULE: holdings, accounts, and the portfolio are only ever shown as percentages.
// There is deliberately no function that formats a portfolio or account value in dollars.
// The only currency formatter is `perSharePrice`, for the public quote of a single ticker,
// and it is only used on the ticker detail screen (enforced by src/test/privacy.test.tsx).

const MINUS = "\u2212";

function finite(x: number | null | undefined): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/** 0.1234 -> "12.3%". Fractions in, percent text out. */
export function pct(x: number | null | undefined, digits = 1): string {
  if (!finite(x)) return "\u2014";
  const v = x * 100;
  const fixed = v.toFixed(digits);
  return `${Number(fixed) === 0 ? (0).toFixed(digits) : fixed.replace("-", MINUS)}%`;
}

/** Signed change: 0.012 -> "+1.2%", -0.03 -> "-3.0%" (typographic minus). */
export function signedPct(x: number | null | undefined, digits = 1): string {
  if (!finite(x)) return "\u2014";
  const v = x * 100;
  const rounded = Number(v.toFixed(digits));
  if (rounded === 0) return `${(0).toFixed(digits)}%`;
  return `${rounded > 0 ? "+" : MINUS}${Math.abs(v).toFixed(digits)}%`;
}

/** Allocation weights: small slices get an extra decimal so they don't all read "0.0%". */
export function weight(x: number | null | undefined): string {
  if (!finite(x)) return "\u2014";
  if (x > 0 && x < 0.001) return "<0.1%";
  return pct(x, 1);
}

/** Percentage points, for differences between two returns. */
export function points(x: number | null | undefined, digits = 1): string {
  if (!finite(x)) return "\u2014";
  return `${Math.abs(x * 100).toFixed(digits)} pts`;
}

export function trendClass(x: number | null | undefined): "pos" | "neg" | "flat" {
  if (!finite(x) || Math.abs(x) < 0.00005) return "flat";
  return x > 0 ? "pos" : "neg";
}

/** Public per-share quote of a single ticker. Never use for holdings or accounts. */
export function perSharePrice(p: number | null | undefined): string {
  if (!finite(p)) return "\u2014";
  const digits = p < 1 ? 4 : 2;
  return `$${p.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/** Index levels (S&P 500 points) are not money; plain number with separators. */
export function indexLevel(p: number | null | undefined): string {
  if (!finite(p)) return "\u2014";
  return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const shortDateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const weekdayFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const stampFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** "2026-10-30" -> "Oct 30, 2026" */
export function longDate(iso: string): string {
  return dateFmt.format(new Date(`${iso}T12:00:00Z`));
}

/** "2026-10-30" -> "Oct 30" */
export function shortDate(iso: string): string {
  return shortDateFmt.format(new Date(`${iso}T12:00:00Z`));
}

/** "2026-10-30" -> "Fri, Oct 30" */
export function dayLabel(iso: string): string {
  return weekdayFmt.format(new Date(`${iso}T12:00:00Z`));
}

/** ISO timestamp -> "Fri, Oct 30, 4:00 PM ET" */
export function stamp(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(d.getTime())) return "\u2014";
  return `${stampFmt.format(d)} ET`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
