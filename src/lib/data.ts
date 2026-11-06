// The dataset written by scripts/fetch-data.mjs, and its decoded in-memory form.
// Dates are epoch days (days since 1970-01-01, UTC) everywhere in the app.

export type Kind = "s" | "e" | "f" | "c" | "i";
/** [count, peakEv, troughEv, recoveryEv] over consecutive start months; -1 = none. */
export type Run = [number, number, number, number];

export interface RawAsset {
  s: string;
  n: string;
  k: Kind;
  a?: string[];
  pop?: 1;
  philly?: 1;
  ipo?: 1;
  first: number;
  m0: number;
  d: string;
  c: (number | null)[];
  end: [number, number];
  ev: [number, number][];
  N: Run[];
  R: Run[];
  mo: Record<string, number[]>;
}

export interface Moment {
  id: string;
  group: "eagles" | "market";
  name: string;
  date: string;
}

export interface Mention {
  s: string;
  title: string;
  link: string;
  date: string;
}

export interface RawDataset {
  v: 4;
  generatedAt: string;
  asOf: number;
  benchmark: string;
  cpi: { b: string; last: string; v: number[]; filled?: string[] };
  spx: { b: string; d: number[]; c: number[] };
  moments: Moment[];
  t: RawAsset[];
  mentions: { asOf: string | null; items: Mention[] };
  quarantined?: string[];
  more?: string;
}

export interface MoreShard {
  v: 4;
  generatedAt: string;
  t: RawAsset[];
}

/** Drawdown episode as event indices into Asset.ev; -1 = none. */
export type Episode = [peak: number, trough: number, rec: number];

export interface MomentStart {
  day: number;
  close: number;
  N: Episode;
  R: Episode;
}

export interface Asset {
  symbol: string;
  name: string;
  kind: Kind;
  aliases: string[];
  popular: boolean;
  philly: boolean;
  /** firstDay is the asset's real first trading day (not a data cut-off). */
  ipo: boolean;
  firstDay: number;
  /** Month index (months since Jan 1988) of the first monthly anchor. */
  m0: number;
  /** Epoch day of each month's first close (NaN if the month had none). */
  monthDays: Float64Array;
  /** Close at each monthly anchor (NaN if none). */
  monthCloses: Float64Array;
  endDay: number;
  endClose: number;
  ev: { day: number; close: number }[];
  /** Per start month: peak, trough, recovery event indices (nominal and real), 3 ints per month. */
  epN: Int32Array;
  epR: Int32Array;
  moments: Map<string, MomentStart>;
}

export interface Dataset {
  generatedAt: string;
  asOfDay: number;
  benchmark: string;
  cpi: { m0: number; last: string; lastIndex: number; v: number[]; filled: string[] };
  spx: { days: Int32Array; closes: Float64Array };
  moments: Moment[];
  assets: Map<string, Asset>;
  order: string[];
  mentions: Mention[];
  mentionsAsOf: string | null;
}

export const LOG_SCALE = 1e8;
export const BASE_YEAR = 1988;

export const monthIndexOf = (year: number, month0: number) => (year - BASE_YEAR) * 12 + month0;
export const monthIndexOfDay = (day: number) => {
  const d = new Date(day * 86400000);
  return monthIndexOf(d.getUTCFullYear(), d.getUTCMonth());
};
export const monthStartDay = (mi: number) =>
  Math.round(Date.UTC(BASE_YEAR + Math.floor(mi / 12), ((mi % 12) + 12) % 12, 1) / 86400000);
export const isoToDay = (iso: string) => Math.round(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) / 86400000);
export const ymdToDay = (ymd: number) =>
  Math.round(Date.UTC(Math.floor(ymd / 10000), (Math.floor(ymd / 100) % 100) - 1, ymd % 100) / 86400000);

function expandRuns(runs: Run[], months: number): Int32Array {
  const out = new Int32Array(months * 3).fill(-1);
  let m = 0;
  for (const [count, p, t, r] of runs) {
    for (let i = 0; i < count && m < months; i++, m++) {
      out[m * 3] = p;
      out[m * 3 + 1] = t;
      out[m * 3 + 2] = r;
    }
  }
  return out;
}

export function decodeAsset(raw: RawAsset, moments: Moment[]): Asset {
  const months = raw.d.length;
  const monthDays = new Float64Array(months).fill(NaN);
  const monthCloses = new Float64Array(months).fill(NaN);
  let acc = 0;
  for (let i = 0; i < months; i++) {
    const delta = raw.c[i];
    const day = parseInt(raw.d[i], 36);
    if (delta == null || !day) continue;
    acc += delta;
    const mi = raw.m0 + i;
    monthDays[i] = Math.round(Date.UTC(BASE_YEAR + Math.floor(mi / 12), mi % 12, day) / 86400000);
    monthCloses[i] = Math.exp(acc / LOG_SCALE);
  }
  const mo = new Map<string, MomentStart>();
  const known = new Set(moments.map((m) => m.id));
  for (const [id, m] of Object.entries(raw.mo ?? {})) {
    if (!known.has(id) || !Array.isArray(m)) continue;
    mo.set(id, { day: m[0], close: m[1], N: [m[2], m[3], m[4]], R: [m[5], m[6], m[7]] });
  }
  return {
    symbol: raw.s,
    name: raw.n,
    kind: raw.k,
    aliases: raw.a ?? [],
    popular: !!raw.pop,
    philly: !!raw.philly,
    ipo: !!raw.ipo,
    firstDay: raw.first,
    m0: raw.m0,
    monthDays,
    monthCloses,
    endDay: raw.end[0],
    endClose: raw.end[1],
    ev: raw.ev.map(([day, close]) => ({ day, close })),
    epN: expandRuns(raw.N, months),
    epR: expandRuns(raw.R, months),
    moments: mo,
  };
}

function decodeSpx(spx: RawDataset["spx"]) {
  const days = new Int32Array(spx.d.length);
  let day = isoToDay(spx.b);
  spx.d.forEach((delta, i) => {
    day += i === 0 ? 0 : delta;
    days[i] = day;
  });
  return { days, closes: Float64Array.from(spx.c) };
}

export function decodeDataset(raw: RawDataset, more: RawAsset[] = []): Dataset {
  const assets = new Map<string, Asset>();
  const order: string[] = [];
  for (const a of [...raw.t, ...more]) {
    if (assets.has(a.s)) continue;
    assets.set(a.s, decodeAsset(a, raw.moments));
    order.push(a.s);
  }
  const [cy, cm] = raw.cpi.b.split("-").map(Number);
  return {
    generatedAt: raw.generatedAt,
    asOfDay: ymdToDay(raw.asOf),
    benchmark: raw.benchmark,
    cpi: {
      m0: monthIndexOf(cy, cm - 1),
      last: raw.cpi.last,
      lastIndex: raw.cpi.v.length - 1,
      v: raw.cpi.v,
      filled: raw.cpi.filled ?? [],
    },
    spx: decodeSpx(raw.spx),
    moments: raw.moments,
    assets,
    order,
    mentions: raw.mentions?.items ?? [],
    mentionsAsOf: raw.mentions?.asOf ?? null,
  };
}

/** Adds the second shard's assets to an already decoded dataset. */
export function withMore(ds: Dataset, moments: Moment[], more: RawAsset[]): Dataset {
  const assets = new Map(ds.assets);
  const order = [...ds.order];
  for (const a of more) {
    if (assets.has(a.s)) continue;
    assets.set(a.s, decodeAsset(a, moments));
    order.push(a.s);
  }
  return { ...ds, assets, order };
}
