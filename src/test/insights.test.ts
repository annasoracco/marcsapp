import { describe, expect, it } from "vitest";
import {
  bigReports,
  briefingHeadline,
  callStory,
  cramerCheck,
  cramerVerdict,
  indexMovers,
  indexWeights,
  marketMood,
  moversSummary,
  upcomingEarnings,
  vsMarketPhrase,
  type Tag,
} from "../lib/insights";
import { evaluateCall, scorecard } from "../lib/calls";
import { addDays, todayET } from "../lib/dates";
import { shortName } from "../lib/names";
import { makeSeries, market } from "./fixtures";
import type { CramerCall } from "../lib/types";

const call = (symbol: string, action: CramerCall["action"], date: string): CramerCall => ({ id: symbol + date + action, symbol, action, date, createdAt: "" });

describe("market mood and headline", () => {
  it("names the sector that led a big move", () => {
    expect(marketMood(-0.018, [{ sector: "Information Technology", change: -0.035 }, { sector: "Energy", change: 0.01 }])).toBe("Rough day for tech");
    expect(marketMood(0.001, [{ sector: "Energy", change: 0.03 }])).toBe("Quiet day for stocks");
    expect(marketMood(0.012, [{ sector: "Financials", change: 0.013 }])).toBe("Strong day for stocks");
  });

  it("writes the hero sentence with the biggest draggers", () => {
    const movers = indexMovers(market);
    const s = briefingHeadline({ mood: "Rough day for tech", sp: -0.018, movers });
    expect(s).toBe("Rough day for tech. The S&P 500 fell 1.8%, dragged by Nvidia and Broadcom.");
    expect(briefingHeadline({ mood: "Good day for stocks", sp: 0.005, movers: [], pastDay: "Friday" })).toBe("Friday was a good day for stocks. The S&P 500 rose 0.5%.");
    expect(briefingHeadline({ mood: "Quiet day for stocks", sp: 0.0001, movers })).toBe("Quiet day for stocks. The S&P 500 was about flat.");
  });

  it("weights index contributions by market cap", () => {
    const movers = indexMovers(market);
    expect(movers[0].symbol).toBe("NVDA");
    const nvda = movers[0];
    const total = Object.values(market.t).filter((t) => t.sp && t.mc).reduce((a, t) => a + t.mc!, 0);
    expect(nvda.pts).toBeCloseTo((4900 / total) * -0.04, 10);
    expect(movers.every((m) => market.t[m.symbol].sp)).toBe(true);
    const w = indexWeights(market);
    expect([...w.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("summarizes what moved the market in plain words", () => {
    const s = moversSummary(indexMovers(market), -0.012)!;
    expect(s).toMatch(/^Tech did most of the dragging\./);
    expect(s).toBe("Tech did most of the dragging. Nvidia, Broadcom and Apple pulled hardest.");
    const up = moversSummary(indexMovers(market).map((m) => ({ ...m, pts: -m.pts })), 0.012)!;
    expect(up).toMatch(/did most of the lifting\. Nvidia, Broadcom and Apple pushed hardest\.$/);
  });
});

describe("earnings", () => {
  const today = todayET();
  const tags = new Map<string, Set<Tag>>([
    ["AMD", new Set<Tag>(["Watching"])],
    ["PLTR", new Set<Tag>(["Cramer call"])],
  ]);
  it("puts watched and Cramer tickers first, then the biggest companies", () => {
    const e = upcomingEarnings(market, tags, today, 7);
    const spy = makeSeries(400, 100, 0.001);
    const pltr = makeSeries(400, 100, 0.002);
    const results = [evaluateCall(call("PLTR", "buy", addDays(today, -60)), pltr, spy, true)];
    const r = bigReports({ earnings: e, weights: indexWeights(market), callResults: results, watchReturns: { AMD: 0.12 }, today });
    expect(r.map((x) => x.symbol).slice(0, 3)).toEqual(["AMD", "PLTR", "AAPL"]);
    expect(r[0].context).toBe("You're watching it. It's up 12.0% since you added it.");
    expect(r[1].context).toMatch(/^Cramer said Buy on .+\. It has beaten the market by \d+\.\d% since\.$/);
    expect(r[2].context).toMatch(/^Apple is about \d+\.\d% of the S&P 500/);
    expect(r[0].title).toMatch(/^AMD reports /);
  });
});

describe("Cramer copy", () => {
  const today = todayET();
  const spy = makeSeries(800, 100, 0.0005);
  const up = makeSeries(800, 100, 0.001);
  const down = makeSeries(800, 100, -0.001);
  const results = [
    evaluateCall(call("A", "buy", addDays(today, -200)), up, spy, true),
    evaluateCall(call("B", "buy", addDays(today, -200)), down, spy, true),
    evaluateCall(call("C", "sell", addDays(today, -200)), down, spy, true),
  ];
  const score = scorecard(results);

  it("answers the follow-or-index question with a winner", () => {
    const v = cramerVerdict(score);
    expect(v.bars.map((b) => b.label)).toEqual(["Follow Cramer", "Do the opposite", "Just buy the S&P"]);
    expect(v.winner).not.toBeNull();
    expect(v.answer).toMatch(/^(Yes, so far|Not so far|No)\./);
    expect(v.answer).not.toMatch(/\u2014/);
  });

  it("explains a scoreless start", () => {
    expect(cramerVerdict(scorecard([])).winner).toBeNull();
    expect(cramerCheck(scorecard([]), 0)).toBe("You're not tracking any of Cramer's calls yet.");
    expect(cramerCheck(score, 3)).toBe("Of the 3 calls you're tracking, 2 were right.");
  });

  it("uses plain wording instead of jargon", () => {
    expect(vsMarketPhrase(0.076)).toBe("Beat the market by 7.6%");
    expect(vsMarketPhrase(-0.09)).toBe("Trailed the market by 9.0%");
    expect(callStory(results[1])).toMatch(/B trailed the market by .+ since, so this one missed\.$/);
    expect(callStory(results[2])).toMatch(/so this one was right\.$/);
  });

  it("cleans company names for sentences", () => {
    expect(shortName("NVIDIA Corporation")).toBe("Nvidia");
    expect(shortName("The Walt Disney Company")).toBe("Walt Disney");
    expect(shortName("JPMorgan Chase & Co.")).toBe("JPMorgan Chase &");
  });
});
