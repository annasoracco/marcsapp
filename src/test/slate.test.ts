import { describe, expect, it } from "vitest";
import { buildSlate, headlineCue, headlineNames, shortName, slateIndex } from "../lib/slate";
import { fixtureData } from "./fixtures";

describe("headlineCue only suggests a side when the headline is clear", () => {
  it.each([
    ["Cramer's lightning round: Sell AMC", "bear"],
    ["Cramer's lightning round: Buy Reddit", "bull"],
    ["Cramer's lightning round: 'McKesson is a winner'", "bull"],
    ["Cramer's lightning round: 'Do not own' MFA Financial", "bear"],
    ["Looking for non-AI stocks to own? Jim Cramer thinks these 2 names are worth buying", "bull"],
    ["Jim Cramer says it's time to look beyond tech. Here are 4 consumer stocks he likes", "bull"],
    ["Cramer's lightning round: 'Broadcom has been one of the greatest performers of all time'", "bull"],
  ])("%s -> %s", (title, side) => {
    expect(headlineCue(title)).toBe(side);
  });

  it.each([
    "Jim Cramer isn't giving up on semiconductor stocks despite the sell off. Here's why",
    "Where Cramer stands on two beaten-down aerospace stocks — and the one to buy",
    "Cramer's week ahead: Expect more volatility as tech earnings, midterms loom",
    "Jim Cramer says Wall Street is punishing the wrong tech stocks",
    "Cramer's lightning round: 'Penguin Solutions sells at a low multiple'",
    "Jim Cramer says this healthcare stock is still a buy. Plus, what to do with BNY",
  ])("no suggestion: %s", (title) => {
    expect(headlineCue(title)).toBeNull();
  });
});

describe("names and tickers", () => {
  it("shortens company names", () => {
    expect(shortName("Kimberly-Clark Corporation", "KMB")).toBe("Kimberly-Clark");
    expect(shortName("Constellation Brands, Inc.", "STZ")).toBe("Constellation Brands");
    expect(shortName("AMC Entertainment Holdings, Inc.", "AMC")).toBe("AMC Entertainment");
    expect(shortName(undefined, "XYZ")).toBe("XYZ");
  });
  it("finds a stock named in a headline by ticker or company name", () => {
    expect(headlineNames("Cramer's lightning round: Sell AMC", "AMC", ["AMC Entertainment"])).toBe(true);
    expect(headlineNames("'Broadcom has been one of the greatest'", "AVGO", ["Broadcom Inc"])).toBe(true);
    expect(headlineNames("Microsoft's big quarter", "MSFT", ["Microsoft Corporation"])).toBe(true);
    expect(headlineNames("Sell AMC", "ASTS", ["AST SpaceMobile"])).toBe(false);
    expect(headlineNames("the AI stock rally", "AI", ["C3.ai"])).toBe(false);
    expect(headlineNames("Cramer's lightning round: Archer Aviation 'is a pure spec'", "ACHR", ["Archer Aviation Inc"])).toBe(true);
    expect(headlineNames("The best stocks to buy now", "BBY", ["Best Buy Co., Inc."])).toBe(false);
    expect(headlineNames("Cramer raises his price target", "TGT", ["Target Corporation"])).toBe(false);
    expect(headlineNames("'Celsius is a second rate Monster'", "MNST", ["Monster Beverage Corporation"])).toBe(false);
  });
});

describe("buildSlate", () => {
  const data = fixtureData();
  const nights = buildSlate(data.news, data.market);
  const index = slateIndex(nights);

  it("groups segments by show night and skips segments with no stocks", () => {
    expect(nights.map((n) => n.air)).toEqual(["2026-10-29"]);
    expect(nights[0].segments).toHaveLength(2);
  });

  it("keeps stocks, drops ETFs and private companies, and flags missing prices", () => {
    expect(index.has("2026-10-29|QQQ")).toBe(false);
    expect(index.has("2026-10-29|OPENAI-FG")).toBe(false);
    expect(index.get("2026-10-29|ZZZZ")?.playable).toBe(false);
    expect(index.get("2026-10-29|KMB")?.playable).toBe(true);
  });

  it("applies a headline's call only to the stock it names, or to the main stocks", () => {
    expect(index.get("2026-10-29|AMC")?.suggest).toBe("bear");
    expect(index.get("2026-10-29|AVGO")?.suggest).toBeUndefined();
    expect(index.get("2026-10-29|KMB")?.suggest).toBe("bull");
    expect(index.get("2026-10-29|STZ")?.suggest).toBe("bull");
  });

  it("carries the move since the show", () => {
    expect(index.get("2026-10-29|KMB")?.since).toBe(-0.004);
  });
});
