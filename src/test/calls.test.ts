import { describe, expect, it } from "vitest";
import { evaluateCall, scorecard } from "../lib/calls";
import { decodeHistory, indexOnOrBefore, withQuote } from "../lib/history";
import { addDays, todayET } from "../lib/dates";
import { pct, signedPct } from "../lib/format";
import type { CramerCall } from "../lib/types";
import { makeSeries } from "./fixtures";

const call = (symbol: string, action: CramerCall["action"], date: string): CramerCall => ({ id: symbol + date, symbol, action, date, createdAt: "" });

describe("history", () => {
  it("decodes compact day deltas", () => {
    const s = decodeHistory({ s: "X", b: "2026-01-02", d: [0, 3, 1], c: [10, 11, 12] });
    expect(s.dates).toEqual(["2026-01-02", "2026-01-05", "2026-01-06"]);
    expect(indexOnOrBefore(s, "2026-01-04")).toBe(0);
    expect(indexOnOrBefore(s, "2026-01-01")).toBe(-1);
  });

  it("appends a newer quote", () => {
    const s = { dates: ["2026-01-02"], closes: [10] };
    const q = { n: "X", k: "s" as const, p: 12, c: 0.2, t: Date.parse("2026-01-05T20:00:00Z") / 1000 };
    expect(withQuote(s, q)).toEqual({ dates: ["2026-01-02", "2026-01-05"], closes: [10, 12] });
  });
});

describe("Cramer calls", () => {
  const today = todayET();
  const spy = makeSeries(800, 100, 0.0005);
  const winner = makeSeries(800, 100, 0.001);
  const loser = makeSeries(800, 100, -0.001);

  it("computes a 2-year back-dated call versus SPY", () => {
    const r = evaluateCall(call("WIN", "buy", addDays(today, -730)), winner, spy, true);
    expect(r.status).toBe("ok");
    expect(r.stockRet!).toBeGreaterThan(r.marketRet!);
    expect(r.right).toBe(true);
    expect(r.excess).toBeCloseTo(r.stockRet! - r.marketRet!, 10);
  });

  it("grades sells as right when the stock lags", () => {
    const r = evaluateCall(call("LOSE", "sell", addDays(today, -100)), loser, spy, true);
    expect(r.right).toBe(true);
    expect(r.edge!).toBeGreaterThan(0);
  });

  it("handles uncovered, too-old and same-day calls", () => {
    expect(evaluateCall(call("X", "buy", today), winner, spy, false).status).toBe("uncovered");
    expect(evaluateCall(call("X", "buy", addDays(today, -1000)), winner, spy, true).status).toBe("tooold");
    expect(evaluateCall(call("X", "buy", today), winner, spy, true).status).toBe("pending");
  });

  it("scores hit rate, inverse Cramer and best/worst", () => {
    const results = [
      evaluateCall(call("A", "buy", addDays(today, -200)), winner, spy, true),
      evaluateCall(call("B", "buy", addDays(today, -200)), loser, spy, true),
      evaluateCall(call("C", "sell", addDays(today, -200)), loser, spy, true),
      evaluateCall(call("D", "hold", addDays(today, -200)), loser, spy, true),
    ];
    const s = scorecard(results);
    expect(s.graded).toBe(3);
    expect(s.right).toBe(2);
    expect(s.hitRate).toBeCloseTo(2 / 3);
    expect(s.avgInverse).toBeCloseTo(-s.avgFollow!);
    expect(s.best!.call.symbol).not.toBe("B");
    expect(s.worst!.call.symbol).toBe("B");
    expect(s.verdict).toBe("cramer");
    expect(s.holds).toBe(1);
  });
});

describe("format", () => {
  it("formats percentages with a real minus sign", () => {
    expect(pct(0.1234)).toBe("12.3%");
    expect(signedPct(0.012)).toBe("+1.2%");
    expect(signedPct(-0.03)).toBe("\u22123.0%");
    expect(signedPct(0.00001)).toBe("0.0%");
  });
});
