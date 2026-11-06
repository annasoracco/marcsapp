import { describe, expect, it } from "vitest";
import { startStats } from "../../scripts/lib/hindsight-core.mjs";
import { resolveInput } from "../App";
import { decodeDataset, isoToDay, monthIndexOf } from "../lib/data";
import { clampMonth, computeScenario, cpiAt, latestCpi, monthRange, resolveStart, surprise } from "../lib/engine";
import { CPI, makeSynthetic } from "./synthetic";

const syn = makeSynthetic();
const ds = decodeDataset(syn.raw, syn.more);
const mi = (y: number, m: number) => monthIndexOf(y, m - 1);
const day = (s: string) => isoToDay(s);
const closeOn = (sym: string, d: string) => {
  const s = syn.series[sym];
  return s.closes[s.dates.indexOf(d)];
};

describe("computeScenario", () => {
  it("values a month start from that month's first close to the latest close", () => {
    const sc = computeScenario(ds, { symbol: "UP", start: { kind: "month", m: mi(2007, 1) }, amount: 30000, real: false })!;
    expect(sc.startDay).toBe(day("2007-01-01"));
    const expected = (30000 * closeOn("UP", "2010-12-31")) / closeOn("UP", "2007-01-01");
    expect(sc.value / expected - 1).toBeLessThan(1e-6);
    expect(sc.endDay).toBe(day("2010-12-31"));
    expect(sc.series[0].tag).toBe("start");
    expect(sc.series.at(-1)!.tag).toBe("end");
    expect(sc.gain).toBeCloseTo(sc.value / 30000 - 1, 10);
  });

  it("compares with the S&P 500 bought on the next trading day and valued on the last one", () => {
    // Bitcoin's month starts on Saturday, March 1, 2008 and its data ends on Sunday, December 26, 2010.
    const sc = computeScenario(ds, { symbol: "BTC", start: { kind: "month", m: mi(2008, 3) }, amount: 1000, real: false })!;
    expect(sc.startDay).toBe(day("2008-03-01"));
    expect(sc.sp!.startDay).toBe(day("2008-03-03"));
    expect(sc.sp!.endDay).toBe(day("2010-12-24"));
    const expected = (1000 * closeOn("^SP", "2010-12-24")) / closeOn("^SP", "2008-03-03");
    expect(sc.sp!.value).toBeCloseTo(expected, 6);
  });

  it("restates every dollar in latest-CPI dollars in real mode", () => {
    const nominal = computeScenario(ds, { symbol: "UP", start: { kind: "month", m: mi(2007, 1) }, amount: 30000, real: false })!;
    const real = computeScenario(ds, { symbol: "UP", start: { kind: "month", m: mi(2007, 1) }, amount: 30000, real: true })!;
    const L = latestCpi(ds);
    expect(L).toBe(CPI.v.at(-1));
    expect(real.invested).toBeCloseTo((30000 * L) / cpiAt(ds, day("2007-01-01")), 6);
    expect(real.value).toBeCloseTo((nominal.value * L) / cpiAt(ds, day("2010-12-31")), 6);
    expect(real.gain).toBeLessThan(nominal.gain);
    expect(real.sp!.value).toBeLessThan(nominal.sp!.value * 1.0000001);
  });

  it("matches the drawdown definition on the daily series, nominal and real", () => {
    const s = syn.series.UP;
    const start = s.dates.indexOf("2007-01-01");
    for (const realMode of [false, true]) {
      const x = realMode ? s.closes.map((c, i) => c / cpiAt(ds, day(s.dates[i]))) : s.closes;
      const r = startStats(x, start);
      const sc = computeScenario(ds, { symbol: "UP", start: { kind: "month", m: mi(2007, 1) }, amount: 30000, real: realMode })!;
      expect(sc.dd!.peak.day).toBe(day(s.dates[r.peak]));
      expect(sc.dd!.trough.day).toBe(day(s.dates[r.trough]));
      expect(sc.dd!.rec?.day ?? -1).toBe(r.rec < 0 ? -1 : day(s.dates[r.rec]));
      expect(sc.dd!.pct).toBeCloseTo(r.worst, 5);
      // The chart dips to the exact daily low, not just the nearest month.
      expect(sc.series.some((p) => p.day === sc.dd!.trough.day && p.tag === "trough")).toBe(true);
    }
  });

  it("starts an IPO month on the first trading day and refuses months before it", () => {
    const asset = ds.assets.get("IPO")!;
    expect(resolveStart(asset, { kind: "month", m: mi(2008, 4) })).toBeNull();
    expect(clampMonth(asset, mi(2007, 10))).toBe(mi(2008, 5));
    const sc = computeScenario(ds, { symbol: "IPO", start: { kind: "month", m: mi(2008, 5) }, amount: 5000, real: false })!;
    expect(sc.startDay).toBe(day("2008-05-14"));
    expect(sc.firstTradingDay).toBe(true);
    expect(monthRange(asset).min).toBe(mi(2008, 5));
  });

  it("only claims a first day of trading for a real listing, not where the data starts", () => {
    const sc = computeScenario(ds, { symbol: "UP", start: { kind: "month", m: mi(2006, 1) }, amount: 1000, real: false })!;
    expect(sc.startDay).toBe(ds.assets.get("UP")!.firstDay);
    expect(sc.firstTradingDay).toBe(false);
  });

  it("matches moments by id, ignoring ids the dataset doesn't know", () => {
    const raw = structuredClone(syn.raw);
    const up = raw.t.find((a) => a.s === "UP")!;
    up.mo = { mystery: up.mo.sunday, ...up.mo };
    const d2 = decodeDataset(raw);
    expect([...d2.assets.get("UP")!.moments.keys()]).toEqual(["sunday"]);
  });

  it("only claims a first day of trading for a real listing, not where the data starts", () => {
    const sc = computeScenario(ds, { symbol: "UP", start: { kind: "month", m: mi(2006, 1) }, amount: 1000, real: false })!;
    expect(sc.startDay).toBe(ds.assets.get("UP")!.firstDay);
    expect(sc.firstTradingDay).toBe(false);
  });

  it("matches moments by id, ignoring ids the dataset doesn't know", () => {
    const raw = structuredClone(syn.raw);
    const up = raw.t.find((a) => a.s === "UP")!;
    up.mo = { mystery: up.mo.sunday, ...up.mo };
    const d2 = decodeDataset(raw);
    expect([...d2.assets.get("UP")!.moments.keys()]).toEqual(["sunday"]);
  });

  it("uses Monday's close for a Sunday moment", () => {
    const sc = computeScenario(ds, { symbol: "UP", start: { kind: "moment", id: "sunday" }, amount: 1000, real: false })!;
    expect(sc.startDay).toBe(day("2008-02-04"));
    expect(sc.startClose).toBeCloseTo(closeOn("UP", "2008-02-04"), 6);
  });

  it("treats a moment before an asset existed as unavailable, and the app falls back to that month", () => {
    expect(computeScenario(ds, { symbol: "IPO", start: { kind: "moment", id: "sunday" }, amount: 1000, real: false })).toBeNull();
    const input = resolveInput(ds, { symbol: "IPO", start: { kind: "moment", id: "sunday" }, amount: 1000, real: false, saved: [] }, true);
    expect(input).toMatchObject({ symbol: "IPO", start: { kind: "month", m: mi(2008, 5) } });
  });

  it("waits for the second shard before giving up on a remembered stock", () => {
    const coreOnly = decodeDataset(syn.raw);
    const state = { symbol: "IPO", start: { kind: "month" as const, m: mi(2009, 1) }, amount: 1, real: false, saved: [] };
    expect(resolveInput(coreOnly, state, false)).toBe("loading");
    expect(resolveInput(coreOnly, { ...state, symbol: "GONE" }, true)).toMatchObject({ symbol: "^SP" });
  });

  it("has no S&P comparison when the investment is the S&P 500", () => {
    const sc = computeScenario(ds, { symbol: "^SP", start: { kind: "month", m: mi(2006, 1) }, amount: 1000, real: false })!;
    expect(sc.sp).toBeNull();
  });
});

describe("surprise", () => {
  it("picks a real scenario that differs from the current one", () => {
    const current = { symbol: "UP", start: { kind: "month" as const, m: mi(2006, 1) }, amount: 30000, real: false };
    const pick = surprise(ds, current, () => 0)!;
    expect(pick).not.toBeNull();
    expect(computeScenario(ds, { ...current, symbol: pick.symbol, start: pick.start })).not.toBeNull();
    expect(pick.symbol === current.symbol && JSON.stringify(pick.start) === JSON.stringify(current.start)).toBe(false);
  });
});
