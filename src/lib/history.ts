import type { HistoryFile, RecentFile, Series, TickerInfo } from "./marketTypes";
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

/** One stock's series from the shared recent-closes file, or null if it isn't in there. */
export function fromRecent(recent: RecentFile | null | undefined, symbol: string): Series | null {
  const closes = recent?.c[symbol];
  if (!recent || !closes) return null;
  const out: Series = { dates: [], closes: [] };
  recent.d.forEach((d, i) => {
    const c = closes[i];
    if (typeof c === "number" && Number.isFinite(c) && c > 0) {
      out.dates.push(d);
      out.closes.push(c);
    }
  });
  return out.dates.length ? out : null;
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

/** Index of the first date on or after `date`, or -1 if every date is earlier. */
export function indexOnOrAfter(dates: string[], date: string): number {
  let lo = 0;
  let hi = dates.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] >= date) {
      ans = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return ans;
}