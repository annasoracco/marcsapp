// Shapes of the static JSON files written by scripts/fetch-data.mjs.

/** s = stock, e = ETF, f = mutual fund, m = money market (cash), i = index */
export type Kind = "s" | "e" | "f" | "m" | "i";

export interface TickerInfo {
  /** name */
  n: string;
  k: Kind;
  /** latest price per share */
  p: number;
  /** today's change as a fraction (0.012 = +1.2%) */
  c: number;
  /** quote time, epoch seconds */
  t?: number;
  /** Yahoo market state, e.g. REGULAR, CLOSED, PRE, POST */
  ms?: string;
  /** GICS-style sector, stocks only */
  sec?: string;
  /** next earnings date, epoch seconds */
  e?: number;
  /** 1 when the earnings date is an estimate */
  est?: 1;
  /** earnings call start, epoch seconds */
  ec?: number;
}

export interface MarketFile {
  asOf: string;
  t: Record<string, TickerInfo>;
}

/** [symbol, weight fraction, name] */
export type FundHolding = [string, number, string];

export interface FundInfo {
  /** stock, bond, cash, other portions (fractions) */
  st: number;
  bd: number;
  ca: number;
  ot: number;
  h: FundHolding[];
  /** sector weights of the equity sleeve (fractions) */
  sec: Record<string, number>;
}

export interface FundsFile {
  asOf: string;
  f: Record<string, FundInfo>;
}

/** A stock CNBC tagged on a Mad Money article. */
export interface NewsTag {
  s: string;
  /** CNBC's name for it */
  n?: string;
  /** 1 when CNBC marked it the article's main ("Primary") stock */
  p?: 1;
  /** move since the segment aired, as a fraction */
  m?: number;
  /** 1 when it aired after the latest close, so there's no move yet */
  f?: 1;
}

export interface NewsItem {
  title: string;
  link: string;
  date: string;
  /** trading day whose close the segment is measured from (YYYY-MM-DD, ET) */
  air?: string;
  tk?: NewsTag[];
}

export interface NewsFile {
  asOf: string | null;
  items: NewsItem[];
  /** every stock CNBC tagged in the past year, with the last date it was tagged */
  tagged?: Record<string, { n: string; seen: string }>;
}

export interface Meta {
  v: number;
  source: "live" | "cached" | "sample";
  generatedAt: string;
  quotesAsOf: string;
  historyAsOf: string | null;
  fundsAsOf: string | null;
  newsAsOf: string | null;
  sectorEtfs: string[];
  indices: string[];
  counts: { tickers: number; history: number; funds: number; news: number };
}

/** Compact daily history: start date, day deltas, adjusted closes. */
export interface HistoryFile {
  s: string;
  b: string;
  d: number[];
  c: number[];
}

export interface Series {
  dates: string[];
  closes: number[];
}

export interface MarketData {
  meta: Meta;
  market: MarketFile;
  funds: FundsFile;
  news: NewsFile;
}
