import { buildAsset, cpiLookup, encodeDaily, monthIndex } from "../../scripts/lib/hindsight-core.mjs";
import type { Moment, RawAsset, RawDataset } from "../lib/data";

export const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export function weekdays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400000) {
    const d = new Date(t).getUTCDay();
    if (d !== 0 && d !== 6) out.push(iso(t));
  }
  return out;
}

export function everyDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400000) out.push(iso(t));
  return out;
}

/** Smooth growth with a 2008 crash and recovery, so every scenario has a known shape. */
export const shape = (i: number, n: number) => 10 * (1 + i / n) * (1 - 0.5 * Math.exp(-(((i - n * 0.45) / (n * 0.06)) ** 2)));

export const MOMENTS: Moment[] = [
  { id: "sunday", group: "eagles", name: "A Sunday win", date: "2008-02-03" },
  { id: "early", group: "market", name: "Before anything", date: "2005-06-01" },
];

export const CPI = { b: "2005-01", m0: monthIndex("2005-01"), v: Array.from({ length: 70 }, (_, i) => 190 + i * 0.5) };

export interface Synthetic {
  raw: RawDataset;
  more: RawAsset[];
  series: Record<string, { dates: string[]; closes: number[] }>;
}

export function makeSynthetic(): Synthetic {
  const spDates = weekdays("2005-01-03", "2010-12-31");
  const spCloses = spDates.map((_, i) => Number((1000 * (1 + (0.3 * i) / spDates.length)).toPrecision(7)));
  const upDates = weekdays("2006-01-02", "2010-12-31");
  const upCloses = upDates.map((_, i) => Number(shape(i, upDates.length).toPrecision(7)));
  const ipoDates = weekdays("2008-05-14", "2010-12-31");
  const ipoCloses = ipoDates.map((_, i) => Number((20 + i * 0.01).toPrecision(7)));
  const btcDates = everyDay("2007-01-01", "2010-12-26");
  const btcCloses = btcDates.map((_, i) => Number(shape(i, btcDates.length).toPrecision(7)));
  const cpiAt = cpiLookup(CPI);
  const mk = (s: string, n: string, k: string, dates: string[], closes: number[], extra = {}) =>
    buildAsset({ info: { s, n, k, ...extra }, dates, closes, cpiAt, moments: MOMENTS })!;
  const raw: RawDataset = {
    v: 4,
    generatedAt: "2011-01-01T00:00:00Z",
    asOf: 20101231,
    benchmark: "^SP",
    cpi: { b: CPI.b, last: "2010-10", v: CPI.v, filled: ["2009-10"] },
    spx: encodeDaily(spDates, spCloses),
    moments: MOMENTS,
    t: [mk("^SP", "S&P 500", "i", spDates, spCloses, { pop: 1 }), mk("UP", "Upward Co (UP)", "s", upDates, upCloses, { pop: 1, a: ["Old Name", "OLD"] })],
    mentions: { asOf: "2010-12-30T00:00:00Z", items: [{ s: "UP", title: "Upward Co is a winner", link: "https://www.cnbc.com/x", date: "2010-12-29T23:00:00Z" }] },
  };
  const more = [mk("IPO", "Newco", "s", ipoDates, ipoCloses, { ipo: true }), mk("BTC", "Coin", "c", btcDates, btcCloses)];
  return {
    raw,
    more,
    series: {
      "^SP": { dates: spDates, closes: spCloses },
      UP: { dates: upDates, closes: upCloses },
      IPO: { dates: ipoDates, closes: ipoCloses },
      BTC: { dates: btcDates, closes: btcCloses },
    },
  };
}
