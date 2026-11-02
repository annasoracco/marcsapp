// Fund X-ray: a research tool for any covered ETF or mutual fund. Uses only public fund data
// (top holdings, sector weights, asset mix) and price history. Nothing about Marc's money.
import type { FundsFile, MarketFile, Series } from "./marketTypes";
import { trailingReturn, ytdReturn } from "./history";
import { SECTOR_SHORT, joinAnd, p0, p1, signed1 } from "./insights";
import { shortName } from "./names";

export type AssetClass = "US stocks" | "International" | "Bonds" | "Cash" | "Other";
export const CLASS_ORDER: AssetClass[] = ["US stocks", "International", "Bonds", "Cash", "Other"];
type Mix = Record<AssetClass, number>;
const emptyMix = (): Mix => ({ "US stocks": 0, International: 0, Bonds: 0, Cash: 0, Other: 0 });

const INTL_SYMBOLS = new Set([
  "VXUS", "VEA", "VWO", "IEFA", "IEMG", "EFA", "EEM", "IXUS", "SCHF", "VGK", "EWJ", "FXI", "INDA", "EWZ",
  "VTIAX", "FTIHX", "FZILX", "FSPSX", "SWISX", "VTMGX", "VWIGX", "VGTSX", "VTISX", "VTPSX", "VFWAX",
]);
const GLOBAL_SYMBOLS = new Set(["VT", "ACWI", "ANWPX"]);
const INTL_RE = /international|intl|ex[- ]?u\.?s|emerging|developed|europe|pacific|japan|china|india|brazil|foreign|world ex/i;
const GLOBAL_RE = /total world|all[- ]world|global|acwi|new perspective/i;
const OTHER_RE = /gold|silver|bitcoin|ether|commodit|crude|oil fund/i;
/** Share of a global fund outside the US (approximate). */
const GLOBAL_INTL_SHARE = 0.38;

export const isFund = (market: MarketFile, symbol: string) => {
  const k = market.t[symbol]?.k;
  return k === "e" || k === "f";
};

function intlShareOf(symbol: string, name: string): number {
  if (INTL_SYMBOLS.has(symbol) || INTL_RE.test(name)) return 1;
  if (GLOBAL_SYMBOLS.has(symbol) || GLOBAL_RE.test(name)) return GLOBAL_INTL_SHARE;
  return 0;
}

/** Asset-class split of a fund, looking through to underlying funds when we have their data. */
export function fundMix(symbol: string, market: MarketFile, funds: FundsFile, depth = 0): Mix {
  const mix = emptyMix();
  const name = market.t[symbol]?.n ?? "";
  const f = funds.f[symbol];
  if (f && depth < 2) {
    const nested = f.h.filter(([h]) => h !== symbol && funds.f[h]);
    const nestedWeight = nested.reduce((a, [, w]) => a + w, 0);
    if (nestedWeight >= 0.5) {
      for (const [h, w] of nested) {
        const sub = fundMix(h, market, funds, depth + 1);
        for (const k of CLASS_ORDER) mix[k] += (w / nestedWeight) * sub[k];
      }
      return mix;
    }
  }
  if (f) {
    const total = f.st + f.bd + f.ca + f.ot || 1;
    const st = f.st / total;
    const intl = intlShareOf(symbol, name);
    mix["US stocks"] = st * (1 - intl);
    mix.International = st * intl;
    mix.Bonds = f.bd / total;
    mix.Cash = f.ca / total;
    mix.Other = f.ot / total;
    if (st + mix.Bonds + mix.Cash < 0.05 && OTHER_RE.test(name)) return { ...emptyMix(), Other: 1 };
    return mix;
  }
  if (market.t[symbol]?.k === "m") return { ...emptyMix(), Cash: 1 };
  if (OTHER_RE.test(name)) mix.Other = 1;
  else if (/bond|treasury|income|aggregate|municipal|tips/i.test(name)) mix.Bonds = 1;
  else {
    const intl = intlShareOf(symbol, name);
    mix["US stocks"] = 1 - intl;
    mix.International = intl;
  }
  return mix;
}

export function mixList(m: Mix): { label: AssetClass; weight: number }[] {
  return CLASS_ORDER.map((label) => ({ label, weight: m[label] }));
}

export interface Holding {
  symbol: string;
  name: string;
  weight: number;
}

/**
 * The companies inside a fund, from its published top holdings. Funds that hold other funds
 * (target-date funds) are opened one level so you see the actual companies.
 */
export function companiesInside(symbol: string, market: MarketFile, funds: FundsFile): { companies: Holding[]; subFunds: Holding[]; shown: number } {
  const f = funds.f[symbol];
  if (!f) return { companies: [], subFunds: [], shown: 0 };
  const companies = new Map<string, Holding>();
  const subFunds: Holding[] = [];
  const add = (raw: string, name: string, w: number) => {
    const sym = SHARE_CLASS[raw] ?? raw;
    const key = sym || name;
    const prev = companies.get(key);
    if (prev) prev.weight += w;
    else companies.set(key, { symbol: sym, name: shortName(market.t[sym]?.n ?? name), weight: w });
  };
  for (const [h, w, n] of f.h) {
    const sub = h !== symbol ? funds.f[h] : undefined;
    if (sub && (sub.h.length || market.t[h]?.k === "e" || market.t[h]?.k === "f" || /^[A-Z]{4}X$/.test(h))) {
      subFunds.push({ symbol: h, name: shortName(market.t[h]?.n ?? n), weight: w });
      for (const [h2, w2, n2] of sub.h) add(h2, n2, w * w2);
    } else {
      add(h, n, w);
    }
  }
  const list = [...companies.values()].sort((a, b) => b.weight - a.weight);
  return { companies: list, subFunds, shown: list.reduce((a, h) => a + h.weight, 0) };
}

/** Sector weights of the fund's stocks, normalized to 100%. */
export function fundSectors(symbol: string, funds: FundsFile, depth = 0): Record<string, number> {
  const f = funds.f[symbol];
  if (!f) return {};
  const nested = f.h.filter(([h]) => h !== symbol && funds.f[h] && Object.keys(funds.f[h].sec).length);
  if (!Object.keys(f.sec).length && nested.length && depth < 2) {
    const out: Record<string, number> = {};
    const tw = nested.reduce((a, [, w]) => a + w, 0);
    for (const [h, w] of nested) for (const [s, v] of Object.entries(fundSectors(h, funds, depth + 1))) out[s] = (out[s] ?? 0) + (w / tw) * v;
    return out;
  }
  const total = Object.values(f.sec).reduce((a, b) => a + b, 0);
  if (total <= 0) return {};
  return Object.fromEntries(Object.entries(f.sec).map(([s, v]) => [s, v / total]));
}

export function spSectors(funds: FundsFile): Record<string, number> {
  const s = fundSectors("SPY", funds);
  return Object.keys(s).length ? s : fundSectors("VOO", funds);
}

export interface Perf {
  key: string;
  label: string;
  fund: number | null;
  sp: number | null;
}

export function performance(fund: Series | null | undefined, sp: Series | null | undefined): Perf[] {
  const windows: [string, string, (s: Series) => number | null][] = [
    ["1m", "1 month", (s) => trailingReturn(s, 30)],
    ["ytd", "This year", (s) => ytdReturn(s)],
    ["1y", "1 year", (s) => trailingReturn(s, 365)],
    ["2y", "2 years", (s) => trailingReturn(s, 730)],
  ];
  return windows.map(([key, label, f]) => ({ key, label, fund: fund ? f(fund) : null, sp: sp ? f(sp) : null }));
}

/** "Over the past year it returned +18.2%, about the same as the S&P 500 (+17.9%)." */
export function perfSentence(symbol: string, perf: Perf[]): string | null {
  const y = perf.find((p) => p.key === "1y" && p.fund !== null && p.sp !== null) ?? perf.find((p) => p.fund !== null && p.sp !== null);
  if (!y || y.fund === null || y.sp === null) return null;
  const span = y.key === "1y" ? "Over the past year" : y.key === "2y" ? "Over two years" : y.key === "ytd" ? "This year" : "Over the past month";
  const diff = y.fund - y.sp;
  const cmp = Math.abs(diff) < 0.01 ? "about the same as" : `${(Math.abs(diff) * 100).toFixed(1)} points ${diff > 0 ? "better than" : "worse than"}`;
  return `${span} ${symbol} returned ${signed1(y.fund)}, ${cmp} the S&P 500 (${signed1(y.sp)}).`;
}

/** Plain-English description of what a fund is and what's in it. */
export function fundSummary(symbol: string, market: MarketFile, funds: FundsFile): string[] {
  const t = market.t[symbol];
  if (!t) return [];
  const name = t.n;
  const m = fundMix(symbol, market, funds);
  const stocks = m["US stocks"] + m.International;
  const vehicle = t.k === "e" ? "ETF" : t.k === "f" ? "mutual fund" : "fund";
  const targetDate = /target|retirement|freedom/i.test(name);
  let kind: string;
  if (targetDate) kind = `target-date ${vehicle} that's ${p0(stocks)} stocks and ${p0(m.Bonds)} bonds today`;
  else if (m["US stocks"] >= 0.8) kind = `US stock ${vehicle}`;
  else if (m.International >= 0.8) kind = `international stock ${vehicle}`;
  else if (stocks >= 0.8) kind = `global stock ${vehicle}, about ${p0(m["US stocks"] / (stocks || 1))} US`;
  else if (m.Bonds >= 0.8) kind = `bond ${vehicle}`;
  else if (m.Cash >= 0.8) kind = `cash-like ${vehicle}`;
  else if (m.Other >= 0.6) kind = `${vehicle} that holds things other than stocks and bonds`;
  else kind = `mixed ${vehicle}: ${p0(stocks)} stocks, ${p0(m.Bonds)} bonds`;
  const out = [`${symbol} is a ${kind}.`];

  const inside = companiesInside(symbol, market, funds);
  if (inside.subFunds.length) {
    const big = [...inside.subFunds].sort((a, b) => b.weight - a.weight)[0];
    out.push(`It's built from ${inside.subFunds.length} other funds; the biggest is ${big.name} at ${p0(big.weight)}.`);
  } else if (inside.companies.length) {
    const top = inside.companies[0];
    out.push(`Its top ${inside.companies.length} holdings are ${p0(inside.shown)} of the fund, led by ${top.name} at ${p1(top.weight)}.`);
  }
  const sec = Object.entries(fundSectors(symbol, funds)).sort((a, b) => b[1] - a[1])[0];
  if (sec && stocks > 0.3) out.push(`${SECTOR_SHORT[sec[0]] ?? sec[0]} is its biggest sector, ${p0(sec[1])} of its stocks.`);
  return out;
}

// ---------- comparing funds ----------

/** Share of top holdings two funds have in common (0..1), each fund's top holdings scaled to 100%. */
export function holdingsOverlap(a: Holding[], b: Holding[]): number | null {
  const ta = a.reduce((s, h) => s + h.weight, 0);
  const tb = b.reduce((s, h) => s + h.weight, 0);
  if (ta <= 0 || tb <= 0) return null;
  const mb = new Map(b.filter((h) => h.symbol).map((h) => [h.symbol, h.weight / tb]));
  let o = 0;
  for (const h of a) if (h.symbol && mb.has(h.symbol)) o += Math.min(h.weight / ta, mb.get(h.symbol)!);
  return o;
}

/** 1 = identical sector mix, 0 = nothing in common. */
export function sectorSimilarity(a: Record<string, number>, b: Record<string, number>): number | null {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  if (!keys.size || !Object.keys(a).length || !Object.keys(b).length) return null;
  let d = 0;
  for (const k of keys) d += Math.abs((a[k] ?? 0) - (b[k] ?? 0));
  return 1 - d / 2;
}

export interface PairInsight {
  a: string;
  b: string;
  overlap: number | null;
  sectorSim: number | null;
  sentence: string;
}

export function comparePair(a: string, b: string, market: MarketFile, funds: FundsFile): PairInsight {
  const ia = companiesInside(a, market, funds).companies;
  const ib = companiesInside(b, market, funds).companies;
  const overlap = holdingsOverlap(ia, ib);
  const sectorSim = sectorSimilarity(fundSectors(a, funds), fundSectors(b, funds));
  const ma = fundMix(a, market, funds);
  const mb = fundMix(b, market, funds);
  const stockA = ma["US stocks"] + ma.International;
  const stockB = mb["US stocks"] + mb.International;
  let sentence: string;
  if ((stockA < 0.2) !== (stockB < 0.2)) {
    const bondy = stockA < 0.2 ? a : b;
    const stocky = bondy === a ? b : a;
    sentence = `${bondy} is mostly ${ma.Bonds + mb.Bonds > 0.5 ? "bonds" : "non-stock assets"} and ${stocky} is mostly stocks, so they barely overlap.`;
  } else if (overlap === null) {
    sentence = sectorSim !== null ? `${a} and ${b} have ${p0(sectorSim)} the same sector mix. Their holdings aren't published in enough detail to compare.` : `There isn't enough published data to compare ${a} and ${b}.`;
  } else if (overlap >= 0.9 && (sectorSim ?? 1) >= 0.9) {
    sentence = `${a} and ${b} are almost the same fund: ${p0(overlap)} overlap in their top holdings.`;
  } else if (overlap >= 0.6) {
    sentence = `${a} and ${b} overlap a lot: ${p0(overlap)} of their top holdings are shared.`;
  } else if (overlap >= 0.25) {
    sentence = `${a} and ${b} overlap somewhat: ${p0(overlap)} of their top holdings are shared.`;
  } else {
    sentence = `${a} and ${b} hold mostly different companies: only ${p0(overlap)} of their top holdings overlap.`;
  }
  return { a, b, overlap, sectorSim, sentence };
}

/** Companies held by at least two of the funds, with each fund's weight. */
export function sharedHoldings(symbols: string[], market: MarketFile, funds: FundsFile): { symbol: string; name: string; weights: (number | null)[] }[] {
  const lists = symbols.map((s) => new Map(companiesInside(s, market, funds).companies.filter((h) => h.symbol).map((h) => [h.symbol, h])));
  const all = new Map<string, string>();
  for (const l of lists) for (const h of l.values()) all.set(h.symbol, h.name);
  return [...all.entries()]
    .map(([symbol, name]) => ({ symbol, name, weights: lists.map((l) => l.get(symbol)?.weight ?? null) }))
    .filter((r) => r.weights.filter((w) => w !== null).length >= 2)
    .sort((x, y) => Math.max(...y.weights.map((w) => w ?? 0)) - Math.max(...x.weights.map((w) => w ?? 0)));
}

export function compareSummary(symbols: string[], perfs: Perf[][]): string | null {
  const yr = perfs.map((p) => p.find((x) => x.key === "1y")?.fund ?? null);
  if (yr.some((v) => v === null)) return null;
  const ranked = symbols.map((s, i) => ({ s, v: yr[i]! })).sort((a, b) => b.v - a.v);
  const spread = ranked[0].v - ranked[ranked.length - 1].v;
  if (spread < 0.01) return `Over the past year they've performed about the same (${joinAnd(ranked.map((r) => `${r.s} ${signed1(r.v)}`))}).`;
  return `Over the past year ${ranked[0].s} did best at ${signed1(ranked[0].v)}, ${(spread * 100).toFixed(1)} points ahead of ${ranked[ranked.length - 1].s}.`;
}

/** Two share classes of one company count as one holding. */
const SHARE_CLASS: Record<string, string> = { GOOG: "GOOGL", "BRK-A": "BRK-B", FOX: "FOXA", NWS: "NWSA" };

export const POPULAR_FUNDS = ["VOO", "FXAIX", "VTI", "QQQ", "SCHD", "VXUS", "BND", "VTTSX"];

