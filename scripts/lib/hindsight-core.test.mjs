import { describe, expect, it } from "vitest";
import {
  bigMoves,
  buildAsset,
  cpiLookup,
  epochDay,
  firstOnOrAfter,
  fromLogDeltas,
  lastOnOrBefore,
  logDeltas,
  momentStart,
  monthIndex,
  monthlyAnchors,
  startStats,
} from "./hindsight-core.mjs";

const days = (start, n, skipWeekends = true) => {
  const out = [];
  let t = Date.parse(`${start}T00:00:00Z`);
  while (out.length < n) {
    const d = new Date(t);
    if (!skipWeekends || (d.getUTCDay() !== 0 && d.getUTCDay() !== 6)) out.push(d.toISOString().slice(0, 10));
    t += 86400000;
  }
  return out;
};

describe("calendar helpers", () => {
  it("finds closes on or after and on or before a date", () => {
    const d = ["2018-02-02", "2018-02-05", "2018-02-06"];
    expect(firstOnOrAfter(d, "2018-02-04")).toBe(1);
    expect(firstOnOrAfter(d, "2018-02-05")).toBe(1);
    expect(firstOnOrAfter(d, "2018-02-07")).toBe(-1);
    expect(lastOnOrBefore(d, "2018-02-04")).toBe(0);
    expect(lastOnOrBefore(d, "2018-02-06")).toBe(2);
    expect(lastOnOrBefore(d, "2018-01-01")).toBe(-1);
  });

  it("anchors each month at its first close, skipping holidays", () => {
    const d = ["1989-12-29", "1990-01-02", "1990-01-03", "1990-02-01"];
    const { m0, idx } = monthlyAnchors(d);
    expect(m0).toBe(monthIndex("1989-12"));
    expect(idx).toEqual([0, 1, 3]);
  });

  it("marks months with no closes as gaps", () => {
    const { idx } = monthlyAnchors(["2000-01-03", "2000-03-01"]);
    expect(idx).toEqual([0, -1, 1]);
  });

  it("starts a Sunday moment at Monday's close, and never before an IPO", () => {
    const d = ["2018-02-02", "2018-02-05"];
    expect(momentStart(d, "2018-02-04")).toBe(1);
    expect(momentStart(["2012-05-18", "2012-05-21"], "2010-12-19")).toBe(-1);
    // A long gap after the event (a halt) is treated as unavailable, not shifted.
    expect(momentStart(["2000-01-03", "2000-03-01"], "2000-01-10")).toBe(-1);
  });
});

describe("startStats", () => {
  it("finds the peak, trough, and recovery of the worst drop", () => {
    //            0    1    2    3    4    5    6    7
    const x = [100, 120, 90, 150, 60, 100, 151, 140];
    const r = startStats(x, 0);
    expect(r).toMatchObject({ peak: 3, trough: 4, rec: 6 });
    expect(r.worst).toBeCloseTo(60 / 150 - 1, 12);
  });

  it("reports no recovery when the old high hasn't been reached", () => {
    const r = startStats([100, 80, 99], 0);
    expect(r).toMatchObject({ peak: 0, trough: 1, rec: -1 });
  });

  it("uses the latest index at the high and the first index at the low", () => {
    const r = startStats([100, 100, 50, 50, 100], 0);
    expect(r).toMatchObject({ peak: 1, trough: 2, rec: 4 });
  });

  it("has no episode when the series never falls", () => {
    expect(startStats([1, 2, 3], 0)).toMatchObject({ peak: -1, trough: -1, rec: -1, worst: 0 });
  });

  it("only looks at the window after the start", () => {
    expect(startStats([100, 10, 20, 30], 1)).toMatchObject({ peak: -1, trough: -1 });
  });
});

describe("encodings", () => {
  it("log deltas reconstruct prices within 5e-9 with no drift", () => {
    let p = 0.0981224;
    const prices = [];
    for (let i = 0; i < 2000; i++) {
      p *= 1 + Math.sin(i * 1.7) * 0.08;
      prices.push(Number(p.toPrecision(10)));
    }
    prices[10] = null;
    const back = fromLogDeltas(logDeltas(prices));
    let worst = 0;
    prices.forEach((x, i) => {
      if (x == null) return expect(back[i]).toBeNull();
      worst = Math.max(worst, Math.abs(back[i] / x - 1));
    });
    expect(worst).toBeLessThanOrEqual(5.0001e-9);
  });

  it("converts ISO dates to epoch days", () => {
    expect(epochDay("1970-01-02")).toBe(1);
    expect(epochDay("2007-10-01")).toBe(13787);
  });
});

describe("cpiLookup", () => {
  it("carries the latest published month forward and clamps before the start", () => {
    const at = cpiLookup({ m0: monthIndex("2026-07"), v: [332.813, 334.131, 336.298] });
    expect(at("2026-08-15")).toBe(334.131);
    expect(at("2026-11-05")).toBe(336.298);
    expect(at("2026-01-02")).toBe(332.813);
  });
});

describe("bigMoves", () => {
  it("flags one-day jumps and crashes beyond the thresholds", () => {
    const m = bigMoves(["a", "b", "c", "d"], [10, 16, 9, 9.5]);
    expect(m.map((x) => x.date)).toEqual(["b", "c"]);
  });
});

describe("buildAsset", () => {
  const dates = days("2007-09-03", 900);
  const closes = dates.map((_, i) => 100 * (1 + 0.6 * Math.sin(i / 60)) * (1 + i / 900));
  const cpiAt = (iso) => 200 + monthIndex(iso) * 0.1;
  const moments = [
    { id: "a", date: "2008-01-05" },
    { id: "b", date: "1990-01-01" },
  ];
  const asset = buildAsset({ info: { s: "TEST", n: "Test", k: "s", pop: 1 }, dates, closes, cpiAt, moments });

  it("expands its run-length tuples to exactly what each start month computes", () => {
    const { idx } = monthlyAnchors(dates);
    const real = closes.map((c, i) => c / cpiAt(dates[i]));
    for (const [runs, x] of [
      [asset.N, closes],
      [asset.R, real],
    ]) {
      const expanded = runs.flatMap(([count, ...t]) => Array.from({ length: count }, () => t));
      expect(expanded.length).toBe(idx.length);
      idx.forEach((s, k) => {
        const r = startStats(x, s);
        const evDay = (e) => (e < 0 ? -1 : asset.ev[e][0]);
        const day = (i) => (i < 0 ? -1 : epochDay(dates[i]));
        expect([evDay(expanded[k][0]), evDay(expanded[k][1]), evDay(expanded[k][2])]).toEqual([day(r.peak), day(r.trough), day(r.rec)]);
      });
    }
  });

  it("starts moments at the first close on or after the event and skips ones before trading began", () => {
    expect(asset.mo[0][0]).toBe(epochDay("2008-01-07"));
    expect(asset.mo[1]).toBe(0);
  });

  it("records day-of-month anchors and the latest close", () => {
    expect(asset.d[0]).toBe("3");
    expect(asset.end[0]).toBe(epochDay(dates.at(-1)));
  });
});
