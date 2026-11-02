import { describe, expect, it } from "vitest";
import { companiesInside, comparePair, fundMix, fundSectors, fundSummary, holdingsOverlap, perfSentence, performance, sharedHoldings, sectorSimilarity } from "../lib/funds";
import { headlineSuggestions, matchHeadline, buildNameIndex } from "../lib/news";
import { data, funds, makeSeries, market } from "./fixtures";

describe("Fund X-ray", () => {
  it("calls near-identical index funds almost the same fund", () => {
    const p = comparePair("VOO", "FXAIX", market, funds);
    expect(p.overlap).toBeGreaterThan(0.97);
    expect(p.sentence).toMatch(/^VOO and FXAIX are almost the same fund: (98|99|100)% overlap in their top holdings\.$/);
  });

  it("describes partial overlap and stock-vs-bond pairs", () => {
    expect(comparePair("VOO", "QQQ", market, funds).sentence).toMatch(/^VOO and QQQ overlap (a lot|somewhat)/);
    expect(comparePair("VOO", "BND", market, funds).sentence).toBe("BND is mostly bonds and VOO is mostly stocks, so they barely overlap.");
  });

  it("opens target-date funds to show the companies inside", () => {
    const inside = companiesInside("VTTSX", market, funds);
    expect(inside.subFunds.map((f) => f.symbol)).toEqual(["VSMPX", "VGTSX", "BND"]);
    expect(inside.companies[0].symbol).toBe("NVDA");
    expect(inside.companies[0].weight).toBeCloseTo(0.55 * 0.08);
    const mix = fundMix("VTTSX", market, funds);
    expect(mix["US stocks"]).toBeCloseTo(0.55);
    expect(mix.International).toBeCloseTo(0.36);
    expect(mix.Bonds).toBeCloseTo(0.09 * 0.99);
    expect(Object.keys(fundSectors("VTTSX", funds)).length).toBeGreaterThan(3);
  });

  it("writes a plain-English summary", () => {
    const s = fundSummary("VOO", market, funds);
    expect(s[0]).toBe("VOO is a US stock ETF.");
    expect(s[1]).toMatch(/^Its top 5 holdings are 27% of the fund, led by Nvidia at 8\.0%\.$/);
    expect(s[2]).toBe("Tech is its biggest sector, 33% of its stocks.");
    expect(fundSummary("VTTSX", market, funds)[0]).toMatch(/^VTTSX is a target-date mutual fund that's 91% stocks and 9% bonds today\.$/);
    expect(fundSummary("BND", market, funds)[0]).toBe("BND is a bond ETF.");
  });

  it("compares performance with the S&P 500", () => {
    const perf = performance(makeSeries(800, 100, 0.001), makeSeries(800, 100, 0.0005));
    expect(perf.map((p) => p.key)).toEqual(["1m", "ytd", "1y", "2y"]);
    expect(perfSentence("VOO", perf)).toMatch(/^Over the past year VOO returned \+\d+\.\d%, \d+\.\d points better than the S&P 500 \(\+\d+\.\d%\)\.$/);
  });

  it("measures overlap and sector similarity", () => {
    const a = [{ symbol: "X", name: "X", weight: 0.5 }, { symbol: "Y", name: "Y", weight: 0.5 }];
    expect(holdingsOverlap(a, a)).toBeCloseTo(1);
    expect(holdingsOverlap(a, [{ symbol: "Z", name: "Z", weight: 1 }])).toBe(0);
    expect(sectorSimilarity({ A: 1 }, { A: 1 })).toBeCloseTo(1);
    expect(sectorSimilarity({ A: 1 }, { B: 1 })).toBeCloseTo(0);
    expect(sharedHoldings(["VOO", "QQQ"], market, funds)[0].symbol).toBe("NVDA");
  });
});

describe("show headline suggestions", () => {
  const index = buildNameIndex(market);
  it("finds companies named in headlines", () => {
    expect(matchHeadline("Cramer's lightning round: Archer Aviation 'is a pure spec'", market, index)).toEqual(["ACHR"]);
    expect(matchHeadline("Cramer's lightning round: Sell AMC", market, index)).toEqual(["AMC"]);
    expect(matchHeadline("Jim Cramer says Microsoft is winning and Alphabet is paying the price", market, index)).toEqual(["MSFT", "GOOGL"]);
    expect(matchHeadline("Jim Cramer says the AI trade needs a CEO who can block out noise", market, index)).toEqual([]);
  });

  it("suggests tracking without creating calls, skipping ones already logged", () => {
    const s = headlineSuggestions(data.news.items, market, []);
    expect(s.map((x) => x.symbol)).toEqual(["ACHR", "AMC", "MSFT"]);
    expect(s[0].segment).toBe("Lightning Round");
    expect(s[0].link).toMatch(/^https:\/\/www\.cnbc\.com\//);
    const already = headlineSuggestions(data.news.items, market, [{ id: "1", symbol: "ACHR", action: "buy", date: s[0].date, createdAt: "" }]);
    expect(already.map((x) => x.symbol)).not.toContain("ACHR");
  });
});
