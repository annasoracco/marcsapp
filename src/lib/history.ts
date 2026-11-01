import type { HistoryFile, Series, TickerInfo } from "./marketTypes";
import { addDays, etDateFromEpoch } from "./dates";

export function normalizeSymbol(raw: string): string {
  return raw.trim().toUpperCase().replace(/^\$/, "").replace(/\./g, "-");
}

/** Must match fileFor() in scripts/fetch-data.mjs. */
export function historyFileName(symbol: string): string {
  return `${symbol.replace(/\^/g, "_")}.json`;
}

export function decodeHistory(h: HistoryFile): Series {
  const dates: string[] = [];
  let cur = h.b;
  for (let i = 0; i < h.d.length; i++) {
    if (i > 0) cur = addDays(cur, h.d[i]);
    dates.push(cur);
  }
  return { dates, closes: h.c.slice(0, dates.length) };
}

/**
 * Brings a daily series up to the latest quote: the quote's price replaces the bar for the
 * same day, or is appended as a new bar if the history file predates it.
 */
export function withQuote(series: Series, quote: TickerInfo | undefined): Series {
  if (!quote || !Number.isFinite(quote.p) || !quote.t || series.dates.length === 0) return series;
  const qDate = etDateFromEpoch(quote.t);
  const lastDate = series.dates[series.dates.length - 1];
  if (qDate < lastDate) return series;
  if (qDate === lastDate) {
    return { dates: series.dates, closes: [...series.closes.slice(0, -1), quote.p] };
  }
  return { dates: [...series.dates, qDate], closes: [...series.closes, quote.p] };
}

/** Index of the last bar on or before `date`, or -1 if the series starts after it. */
export function indexOnOrBefore(series: Series, date: string): number {
  let lo = 0;
  let hi = series.dates.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series.dates[mid] <= date) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** Percent return (as a fraction) from the close on/before `from` to the latest bar. */
export function returnSince(series: Series, from: string): number | null {
  const i = indexOnOrBefore(series, from);
  if (i < 0 || series.closes.length === 0) return null;
  const base = series.closes[i];
  const last = series.closes[series.closes.length - 1];
  return base > 0 ? last / base - 1 : null;
}

/** Return over the trailing window ending at the latest bar. */
export function trailingReturn(series: Series, days: number): number | null {
  if (series.dates.length === 0) return null;
  const end = series.dates[series.dates.length - 1];
  const start = addDays(end, -days);
  if (series.dates[0] > start) return null;
  return returnSince(series, start);
}

export function ytdReturn(series: Series): number | null {
  if (series.dates.length === 0) return null;
  const end = series.dates[series.dates.length - 1];
  const yearStart = `${Number(end.slice(0, 4)) - 1}-12-31`;
  if (series.dates[0] > yearStart) return null;
  return returnSince(series, yearStart);
}

export function sliceFrom(series: Series, from: string): Series {
  const i = Math.max(0, indexOnOrBefore(series, from));
  return { dates: series.dates.slice(i), closes: series.closes.slice(i) };
}
