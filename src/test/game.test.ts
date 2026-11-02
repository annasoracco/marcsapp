import { describe, expect, it } from "vitest";
import {
  type FinalGame,
  type Game,
  evaluate,
  isBeforeKickoff,
  kickoffDate,
  leadingSide,
  makeCalendar,
  resultFor,
  standings,
  weekByWeek,
  weekNumber,
} from "../lib/game";
import { DATES, etEpoch, series } from "./fixtures";

const at = (iso: string) => new Date(iso);

function game(over: Partial<Game> = {}): Game {
  return {
    id: "2026-10-14|ABC",
    s: "ABC",
    n: "ABC Corp",
    air: "2026-10-14",
    title: "t",
    link: "https://www.cnbc.com/x.html",
    cramer: "bull",
    marc: "bear",
    at: "2026-10-14T23:00:00-04:00",
    kick: "2026-10-15",
    ...over,
  };
}

describe("kickoffDate: the first market close after the pick", () => {
  it("uses today's close when picked during a weekday before 4pm ET", () => {
    expect(kickoffDate(at("2026-10-14T10:00:00-04:00"))).toBe("2026-10-14");
    expect(kickoffDate(at("2026-10-14T15:59:00-04:00"))).toBe("2026-10-14");
  });
  it("rolls to the next weekday after the close", () => {
    expect(kickoffDate(at("2026-10-14T16:00:00-04:00"))).toBe("2026-10-15");
    expect(kickoffDate(at("2026-10-14T23:30:00-04:00"))).toBe("2026-10-15");
  });
  it("skips the weekend", () => {
    expect(kickoffDate(at("2026-10-16T18:00:00-04:00"))).toBe("2026-10-19");
    expect(kickoffDate(at("2026-10-17T12:00:00-04:00"))).toBe("2026-10-19");
    expect(kickoffDate(at("2026-10-18T09:00:00-04:00"))).toBe("2026-10-19");
  });
  it("works in Eastern time regardless of the phone's time zone", () => {
    // 21:30 UTC on Oct 14 is 5:30pm ET, after the close.
    expect(kickoffDate(at("2026-10-14T21:30:00Z"))).toBe("2026-10-15");
  });
});

describe("evaluate", () => {
  const spy = series(DATES, 100, 0.001);
  const closedQuote = { n: "SPY", k: "e" as const, p: spy.closes.at(-1)!, c: 0, t: etEpoch("2026-10-30", "16:00") };
  const cal = makeCalendar(spy, closedQuote);

  it("is pending until the kickoff close is final", () => {
    expect(evaluate(game({ kick: "2026-11-02" }), cal, spy)).toEqual({ kind: "pending", kick: "2026-11-02" });
    const intraday = makeCalendar(spy, { ...closedQuote, t: etEpoch("2026-10-30", "11:30") });
    expect(evaluate(game({ kick: "2026-10-30" }), intraday, spy)).toEqual({ kind: "pending", kick: "2026-10-30" });
  });

  it("is live during the five trading days, measured from the kickoff close", () => {
    const stock = series(DATES, 50, 0.01);
    const st = evaluate(game({ kick: "2026-10-27" }), cal, stock);
    expect(st.kind).toBe("live");
    if (st.kind !== "live") return;
    expect(st.kick).toBe("2026-10-27");
    expect(st.day).toBe(3);
    expect(st.sr).toBeCloseTo(1.01 ** 3 - 1, 4);
    expect(st.br).toBeCloseTo(1.001 ** 3 - 1, 4);
  });

  it("goes final after five trading days, over the weekend", () => {
    const stock = series(DATES, 50, -0.01);
    const st = evaluate(game({ kick: "2026-10-15" }), cal, stock);
    expect(st).toMatchObject({ kind: "final", fin: { k: "2026-10-15", e: "2026-10-22" } });
    if (st.kind !== "final") return;
    expect(st.fin.sr).toBeCloseTo(0.99 ** 5 - 1, 4);
    expect(resultFor("bear", st.fin.sr, st.fin.br)).toBe("W");
    expect(resultFor("bull", st.fin.sr, st.fin.br)).toBe("L");
  });

  it("moves a holiday kickoff to the next trading day", () => {
    const noFriday = { dates: spy.dates.filter((d) => d !== "2026-10-16"), closes: spy.closes.filter((_, i) => spy.dates[i] !== "2026-10-16") };
    const holidayCal = makeCalendar(noFriday, closedQuote);
    const st = evaluate(game({ kick: "2026-10-16" }), holidayCal, series(DATES, 10, 0));
    expect(st).toMatchObject({ kind: "final", fin: { k: "2026-10-19", e: "2026-10-26" } });
  });

  it("handles missing prices gracefully", () => {
    expect(evaluate(game(), cal, null)).toEqual({ kind: "nodata", kick: "2026-10-15" });
    expect(evaluate(game(), cal, undefined)).toEqual({ kind: "loading" });
    expect(evaluate(game(), undefined, null)).toEqual({ kind: "loading" });
    const late = series(DATES.slice(15), 10, 0);
    expect(evaluate(game({ kick: "2026-10-02" }), cal, late).kind).toBe("nodata");
  });

  it("uses a saved final even with no prices", () => {
    const fin = { k: "2026-10-15", e: "2026-10-22", sr: 0.05, br: 0.01 };
    expect(evaluate(game({ fin }), null, null)).toEqual({ kind: "final", fin });
  });

  it("never settles on a stock price that isn't that day's close", () => {
    const stock = series(DATES, 50, 0.01);
    // The stock's prices stop a day early: the matchup stays live instead of settling on a stale price.
    const lagging = { dates: stock.dates.filter((d) => d !== "2026-10-22"), closes: stock.closes.filter((_, i) => stock.dates[i] !== "2026-10-22") };
    expect(evaluate(game({ kick: "2026-10-15" }), cal, lagging)).toMatchObject({ kind: "live", day: 5 });
    // The final day's price is an 11:00 quote: still live.
    const early = { n: "ABC", k: "s" as const, p: 1, c: 0, t: etEpoch("2026-10-30", "11:00") };
    expect(evaluate(game({ kick: "2026-10-23" }), cal, stock, early)).toMatchObject({ kind: "live", day: 5 });
    const closed = { ...early, t: etEpoch("2026-10-30", "16:00") };
    expect(evaluate(game({ kick: "2026-10-23" }), cal, stock, closed).kind).toBe("final");
  });

  it("doesn't trust the latest bar without a quote, or a quote appended to stale history", () => {
    expect(makeCalendar(spy, undefined).lastFinal).toBe(spy.dates.length - 2);
    const stale = {
      dates: [...spy.dates.slice(0, -3), "2026-10-30"],
      closes: [...spy.closes.slice(0, -3), spy.closes.at(-1)!],
    };
    const gap = makeCalendar(stale, closedQuote);
    expect(gap.dates.at(-1)).toBe("2026-10-27");
    expect(gap.lastFinal).toBe(gap.dates.length - 1);
  });

  it("locks a pick at its kickoff close by the clock, even if prices are stale", () => {
    const g = game({ kick: "2026-10-15" });
    expect(isBeforeKickoff(g, at("2026-10-15T15:30:00-04:00"))).toBe(true);
    expect(isBeforeKickoff(g, at("2026-10-15T16:05:00-04:00"))).toBe(false);
    expect(isBeforeKickoff(g, at("2026-10-14T21:00:00-04:00"))).toBe(true);
  });
});

describe("scoring", () => {
  it("Bull wins when the stock beats the S&P 500, Bear when it trails, tie when dead even", () => {
    expect(leadingSide(0.03, 0.01)).toBe("bull");
    expect(leadingSide(-0.03, -0.01)).toBe("bear");
    expect(leadingSide(0.010001, 0.01)).toBeNull();
    expect(resultFor("bull", 0.01, 0.01)).toBe("T");
  });

  const fg = (id: string, marc: "bull" | "bear", cramer: "bull" | "bear", sr: number, e: string): FinalGame => ({
    ...game({ id, marc, cramer }),
    fin: { k: "2026-10-15", e, sr, br: 0 },
  });

  it("builds both records from the same matchups, with streaks and head to head", () => {
    const st = standings([
      fg("a", "bull", "bull", 0.02, "2026-10-20"), // both W
      fg("b", "bear", "bull", 0.03, "2026-10-21"), // Marc L, Cramer W
      fg("c", "bear", "bull", -0.04, "2026-10-22"), // Marc W, Cramer L
      fg("d", "bear", "bull", -0.01, "2026-10-23"), // Marc W, Cramer L
      fg("e", "bull", "bear", 0, "2026-10-24"), // tie for both
    ]);
    expect(st.marc).toMatchObject({ w: 3, l: 1, t: 1, streak: { r: "W", n: 2 } });
    expect(st.cramer).toMatchObject({ w: 2, l: 2, t: 1, streak: { r: "L", n: 2 } });
    expect(st.h2h).toEqual({ marc: 2, cramer: 1 });
    expect(st.marc.last).toEqual(["W", "L", "W", "W", "T"]);
  });

  it("numbers weeks from the season's first kickoff and tallies each week", () => {
    expect(weekNumber("2026-10-14", "2026-10-16")).toBe(1);
    expect(weekNumber("2026-10-14", "2026-10-19")).toBe(2);
    expect(weekNumber("2026-10-14", "2026-11-02")).toBe(4);
    const weeks = weekByWeek([
      { ...fg("a", "bull", "bear", 0.02, "2026-10-21"), fin: { k: "2026-10-14", e: "2026-10-21", sr: 0.02, br: 0 } },
      { ...fg("b", "bull", "bear", -0.02, "2026-10-28"), fin: { k: "2026-10-21", e: "2026-10-28", sr: -0.02, br: 0 } },
    ]);
    expect(weeks.map((w) => [w.week, w.marc.w, w.marc.l, w.cramer.w])).toEqual([
      [2, 0, 1, 1],
      [1, 1, 0, 0],
    ]);
  });
});
