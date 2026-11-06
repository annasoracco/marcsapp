const UTC = "UTC";
const dayFmt = new Intl.DateTimeFormat("en-US", { timeZone: UTC, month: "short", day: "numeric", year: "numeric" });
const monthFmt = new Intl.DateTimeFormat("en-US", { timeZone: UTC, month: "short", year: "numeric" });
const monthLongFmt = new Intl.DateTimeFormat("en-US", { timeZone: UTC, month: "long", year: "numeric" });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export const dayDate = (day: number) => new Date(day * 86400000);
/** "Oct 1, 2007" */
export const fmtDay = (day: number) => dayFmt.format(dayDate(day));
const shortDayFmt = new Intl.DateTimeFormat("en-US", { timeZone: UTC, month: "short", day: "numeric" });
/** "Nov 5" */
export const fmtShortDay = (day: number) => shortDayFmt.format(dayDate(day));
/** "Oct 2007" */
export const fmtMonthOfDay = (day: number) => monthFmt.format(dayDate(day));
/** Month index since Jan 1988 -> "Oct 2007" */
export const fmtMonthIndex = (mi: number) => monthFmt.format(new Date(Date.UTC(1988 + Math.floor(mi / 12), mi % 12, 1)));
export const fmtMonthIndexLong = (mi: number) =>
  monthLongFmt.format(new Date(Date.UTC(1988 + Math.floor(mi / 12), mi % 12, 1)));
/** "2026-09" -> "Sep 2026" */
export const fmtIsoMonth = (iso: string) => monthFmt.format(new Date(`${iso.slice(0, 7)}-01T00:00:00Z`));
export const yearOfDay = (day: number) => dayDate(day).getUTCFullYear();

/** "$343,640" (whole dollars; negative values never occur for investments). */
export const fmtMoney = (v: number) => usd0.format(Math.round(v));

/** "$343.6K", "$1.24M", "$950" for tight spots like chart labels. */
export function fmtMoneyShort(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${trim(v / 1e9, a >= 1e11 ? 0 : a >= 1e10 ? 1 : 2)}B`;
  if (a >= 1e6) return `$${trim(v / 1e6, a >= 1e8 ? 0 : a >= 1e7 ? 1 : 2)}M`;
  if (a >= 1e4) return `$${trim(v / 1e3, a >= 1e5 ? 0 : 1)}K`;
  return fmtMoney(v);
}

function trim(x: number, digits: number): string {
  return x.toFixed(digits).replace(/\.0+$|(\.\d*?)0+$/, "$1");
}

/** Amount as typed, compact: 30000 -> "$30,000", 1500000 -> "$1.5M" */
export const fmtAmount = (v: number) => (v >= 1e6 ? fmtMoneyShort(v) : fmtMoney(v));

/** Signed percent change: +1,045%, +12.4%, -3.1% (with a real minus sign). */
export function fmtPct(g: number, signed = true): string {
  const pct = g * 100;
  const a = Math.abs(pct);
  const body = a >= 100 ? int.format(Math.round(a)) : a >= 10 ? a.toFixed(0) : a.toFixed(1);
  if (!signed) return `${body}%`;
  if (body === "0.0" || body === "0") return "0%";
  return `${pct < 0 ? "\u2212" : "+"}${body}%`;
}

/** "11.5×", "2.03×", "143×" */
export function fmtMultiple(m: number): string {
  if (m >= 100) return `${int.format(Math.round(m))}\u00d7`;
  if (m >= 10) return `${m.toFixed(1)}\u00d7`;
  return `${m.toFixed(2)}\u00d7`;
}

/** "2 years, 4 months", "11 months", "3 weeks", "5 days" */
export function fmtDuration(days: number): string {
  const months = Math.round(days / 30.4375);
  if (days < 14) return plural(days, "day");
  if (months < 2) return plural(Math.round(days / 7), "week");
  if (months < 24) return plural(months, "month");
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${plural(y, "year")}, ${plural(m, "month")}` : plural(y, "year");
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
