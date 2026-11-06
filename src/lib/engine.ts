import type { Asset, Dataset, Episode } from "./data";
import { monthIndexOfDay } from "./data";

export type StartRef = { kind: "month"; m: number } | { kind: "moment"; id: string };

export interface ScenarioInput {
  symbol: string;
  start: StartRef;
  amount: number;
  real: boolean;
}

export type PointTag = "start" | "peak" | "trough" | "rec" | "end";

export interface Point {
  day: number;
  /** Value of the investment in display dollars (today's dollars when `real`). */
  value: number;
  tag?: PointTag;
}

export interface Drawdown {
  peak: Point;
  trough: Point;
  rec: Point | null;
  /** trough / peak - 1, from unrounded display values (negative). */
  pct: number;
  fallDays: number;
  /** Days from the trough back to the old high, or null if it hasn't happened. */
  recDays: number | null;
  /** If not recovered: how far below the old high it is now (negative). */
  belowNow: number | null;
}

export interface Comparison {
  startDay: number;
  endDay: number;
  value: number;
  gain: number;
  multiple: number;
  /** S&P value at each of the scenario's chart points. */
  series: Point[];
}

export interface Scenario {
  asset: Asset;
  start: StartRef;
  startDay: number;
  startClose: number;
  /** The start is the asset's first trading day (an IPO month on the slider). */
  firstTradingDay: boolean;
  endDay: number;
  endClose: number;
  amount: number;
  real: boolean;
  /** What was put in, in display dollars. */
  invested: number;
  value: number;
  gain: number;
  multiple: number;
  series: Point[];
  sp: Comparison | null;
  dd: Drawdown | null;
  cpiMonth: string;
}

export const DEFAULT_INPUT: ScenarioInput = {
  symbol: "AAPL",
  start: { kind: "month", m: (2007 - 1988) * 12 + 9 },
  amount: 30000,
  real: false,
};

export function cpiAt(ds: Dataset, day: number): number {
  const k = monthIndexOfDay(day) - ds.cpi.m0;
  return ds.cpi.v[Math.max(0, Math.min(ds.cpi.lastIndex, k))];
}

export const latestCpi = (ds: Dataset) => ds.cpi.v[ds.cpi.lastIndex];

/** First and last start months the slider can use for an asset. */
export function monthRange(asset: Asset): { min: number; max: number } {
  let first = 0;
  while (first < asset.monthCloses.length && Number.isNaN(asset.monthCloses[first])) first++;
  return { min: asset.m0 + first, max: asset.m0 + asset.monthCloses.length - 1 };
}

/** The nearest month the asset has a close for, within its range. */
export function clampMonth(asset: Asset, m: number): number {
  const { min, max } = monthRange(asset);
  let x = Math.max(min, Math.min(max, Math.round(m)));
  while (x > min && Number.isNaN(asset.monthCloses[x - asset.m0])) x--;
  while (x < max && Number.isNaN(asset.monthCloses[x - asset.m0])) x++;
  return x;
}

interface ResolvedStart {
  day: number;
  close: number;
  epN: Episode;
  epR: Episode;
}

export function resolveStart(asset: Asset, ref: StartRef): ResolvedStart | null {
  if (ref.kind === "moment") {
    const m = asset.moments.get(ref.id);
    return m ? { day: m.day, close: m.close, epN: m.N, epR: m.R } : null;
  }
  const i = ref.m - asset.m0;
  if (i < 0 || i >= asset.monthCloses.length || Number.isNaN(asset.monthCloses[i])) return null;
  const ep = (a: Int32Array): Episode => [a[i * 3], a[i * 3 + 1], a[i * 3 + 2]];
  return { day: asset.monthDays[i], close: asset.monthCloses[i], epN: ep(asset.epN), epR: ep(asset.epR) };
}

/** Index of the first S&P close on or after `day`, or -1. */
function spOnOrAfter(ds: Dataset, day: number): number {
  const a = ds.spx.days;
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < day) lo = mid + 1;
    else hi = mid;
  }
  return lo < a.length ? lo : -1;
}

/** Index of the last S&P close on or before `day`, or -1. */
function spOnOrBefore(ds: Dataset, day: number): number {
  const i = spOnOrAfter(ds, day);
  if (i === -1) return ds.spx.days.length - 1;
  return ds.spx.days[i] === day ? i : i - 1;
}

export function computeScenario(ds: Dataset, input: ScenarioInput): Scenario | null {
  const asset = ds.assets.get(input.symbol);
  if (!asset) return null;
  const st = resolveStart(asset, input.start);
  if (!st) return null;
  const { amount, real } = input;
  const cpiL = latestCpi(ds);
  const toDisplay = (nominal: number, day: number) => (real ? (nominal * cpiL) / cpiAt(ds, day) : nominal);
  const valueAt = (close: number, day: number) => toDisplay((amount * close) / st.close, day);

  // Chart points: the start, every monthly anchor after it, the drawdown's exact days, and the latest close.
  const pts: Point[] = [{ day: st.day, value: valueAt(st.close, st.day), tag: "start" }];
  for (let i = 0; i < asset.monthDays.length; i++) {
    const day = asset.monthDays[i];
    if (Number.isNaN(day) || day <= st.day || day >= asset.endDay) continue;
    pts.push({ day, value: valueAt(asset.monthCloses[i], day) });
  }
  if (asset.endDay > st.day) pts.push({ day: asset.endDay, value: valueAt(asset.endClose, asset.endDay), tag: "end" });

  const [p, t, r] = real ? st.epR : st.epN;
  let dd: Drawdown | null = null;
  if (p >= 0 && t >= 0) {
    const mk = (e: number, tag: PointTag): Point => ({
      day: asset.ev[e].day,
      value: valueAt(asset.ev[e].close, asset.ev[e].day),
      tag,
    });
    const peak = mk(p, "peak");
    const trough = mk(t, "trough");
    const rec = r >= 0 ? mk(r, "rec") : null;
    const last = pts[pts.length - 1];
    dd = {
      peak,
      trough,
      rec,
      pct: trough.value / peak.value - 1,
      fallDays: trough.day - peak.day,
      recDays: rec ? rec.day - trough.day : null,
      belowNow: rec ? null : last.value / peak.value - 1,
    };
    for (const e of [peak, trough, rec]) {
      if (!e) continue;
      const same = pts.find((x) => x.day === e.day);
      if (same) same.tag = same.tag === "start" || same.tag === "end" ? same.tag : e.tag;
      else pts.push(e);
    }
    pts.sort((a, b) => a.day - b.day);
  }

  const endPt = pts[pts.length - 1];
  const invested = toDisplay(amount, st.day);
  const value = endPt.value;

  let sp: Comparison | null = null;
  if (asset.symbol !== ds.benchmark) {
    const s0 = spOnOrAfter(ds, st.day);
    const e0 = spOnOrBefore(ds, asset.endDay);
    if (s0 >= 0 && e0 >= s0) {
      const base = ds.spx.closes[s0];
      const spStartDay = ds.spx.days[s0];
      const spValue = (day: number) => {
        if (day < spStartDay) return toDisplay(amount, day);
        const i = spOnOrBefore(ds, day);
        return toDisplay((amount * ds.spx.closes[i]) / base, day);
      };
      const series = pts.map((x) => ({ day: x.day, value: spValue(x.day) }));
      const endValue = toDisplay((amount * ds.spx.closes[e0]) / base, ds.spx.days[e0]);
      sp = {
        startDay: spStartDay,
        endDay: ds.spx.days[e0],
        value: endValue,
        gain: endValue / invested - 1,
        multiple: endValue / invested,
        series,
      };
    }
  }

  return {
    asset,
    start: input.start,
    startDay: st.day,
    startClose: st.close,
    firstTradingDay: asset.ipo && st.day === asset.firstDay,
    endDay: asset.endDay,
    endClose: asset.endClose,
    amount,
    real,
    invested,
    value,
    gain: value / invested - 1,
    multiple: value / invested,
    series: pts,
    sp,
    dd,
    cpiMonth: ds.cpi.last,
  };
}

/** Month index a start ref points at (moments map to their month), for the slider. */
export function startMonth(asset: Asset, ref: StartRef): number | null {
  if (ref.kind === "month") return ref.m;
  const m = asset.moments.get(ref.id);
  return m ? monthIndexOfDay(m.day) : null;
}

const SURPRISE_KINDS = new Set(["s", "c", "i"]);

export interface SurprisePick {
  symbol: string;
  start: StartRef;
  score: number;
}

/**
 * Dramatic but truthful scenarios: big multiples or deep drops, scanned from the real dataset.
 * `rand` is injectable so tests are deterministic.
 */
export function surprise(ds: Dataset, current: ScenarioInput, rand: () => number = Math.random): SurprisePick | null {
  const picks: SurprisePick[] = [];
  for (const asset of ds.assets.values()) {
    if (!SURPRISE_KINDS.has(asset.kind)) continue;
    const { min, max } = monthRange(asset);
    const starts: StartRef[] = ds.moments.filter((m) => asset.moments.has(m.id)).map((m) => ({ kind: "moment", id: m.id }));
    for (let m = min; m <= max - 24; m += 6) starts.push({ kind: "month", m });
    for (const start of starts) {
      const st = resolveStart(asset, start);
      if (!st) continue;
      const mult = asset.endClose / st.close;
      const [p, t] = st.epN;
      const drop = p >= 0 && t >= 0 ? 1 - asset.ev[t].close / asset.ev[p].close : 0;
      const years = (asset.endDay - st.day) / 365.25;
      if (years < 2) continue;
      const score = Math.abs(Math.log(mult)) + 2.5 * drop + (start.kind === "moment" ? 0.6 : 0) + (asset.popular ? 0.8 : 0);
      picks.push({ symbol: asset.symbol, start, score });
    }
  }
  picks.sort((a, b) => b.score - a.score);
  const same = (x: SurprisePick) =>
    x.symbol === current.symbol && JSON.stringify(x.start) === JSON.stringify(current.start);
  // Spread across assets: best few per symbol, then a random draw from the top of that list.
  const perSymbol = new Map<string, number>();
  const pool: SurprisePick[] = [];
  for (const x of picks) {
    if (same(x)) continue;
    const n = perSymbol.get(x.symbol) ?? 0;
    if (n >= 3) continue;
    perSymbol.set(x.symbol, n + 1);
    pool.push(x);
    if (pool.length >= 60) break;
  }
  if (!pool.length) return null;
  return pool[Math.floor(rand() * pool.length)];
}
