import { describe, expect, it } from "vitest";
import { EMPTY_STATE, STORAGE_KEY, backupText, loadState, parseBackup, parseState, reducer, saveState } from "../lib/store";
import type { Game } from "../lib/game";

const g: Game = {
  id: "2026-10-29|AMC",
  s: "AMC",
  n: "AMC Entertainment",
  air: "2026-10-29",
  title: "Cramer's lightning round: Sell AMC",
  link: "https://www.cnbc.com/2026/10/29/sell-amc.html",
  cramer: "bear",
  marc: "bull",
  at: "2026-10-29T23:30:00.000Z",
  kick: "2026-10-30",
};

describe("saved state", () => {
  it("round-trips through localStorage under one key", () => {
    const state = reducer(EMPTY_STATE, { type: "pick", game: g });
    saveState(state);
    expect(Object.keys(localStorage)).toEqual([STORAGE_KEY]);
    expect(loadState()).toEqual(state);
  });

  it("drops anything malformed and never keeps unknown fields", () => {
    const parsed = parseState({
      games: {
        ok: { ...g, shares: 100, balance: 2500 },
        bad: { ...g, id: "x", marc: "maybe" },
        badDate: { ...g, id: "y", kick: "soon" },
      },
      hidden: ["a", 5, "a"],
      owned: ["brk.b", "aapl", "", 7],
      balance: 1000,
    });
    expect(Object.keys(parsed.games)).toEqual([g.id]);
    expect(parsed.games[g.id]).not.toHaveProperty("shares");
    expect(parsed.hidden).toEqual(["a"]);
    expect(parsed.owned).toEqual(["AAPL", "BRK-B"]);
    expect(parsed).not.toHaveProperty("balance");
  });

  it("only allows CNBC links", () => {
    expect(parseState({ games: { a: { ...g, link: "javascript:alert(1)" } } }).games[g.id].link).toBe("");
  });

  it("survives broken storage", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadState()).toEqual(EMPTY_STATE);
  });
});

describe("reducer", () => {
  it("picking a stock takes it out of the hidden list", () => {
    const hidden = reducer(EMPTY_STATE, { type: "hide", id: g.id });
    expect(reducer(hidden, { type: "pick", game: g }).hidden).toEqual([]);
  });

  it("never changes a settled matchup, and finals can't be removed", () => {
    const fin = { k: "2026-10-30", e: "2026-11-06", sr: 0.1, br: 0 };
    let s = reducer(EMPTY_STATE, { type: "pick", game: g });
    s = reducer(s, { type: "settle", id: g.id, fin });
    expect(reducer(s, { type: "settle", id: g.id, fin: { ...fin, sr: -1 } }).games[g.id].fin).toEqual(fin);
    expect(reducer(s, { type: "pick", game: { ...g, marc: "bear" } }).games[g.id].marc).toBe("bull");
    expect(reducer(s, { type: "remove", id: g.id }).games[g.id]).toBeDefined();
  });

  it("allows changing a pick before kickoff but not after", () => {
    const s = reducer(EMPTY_STATE, { type: "pick", game: g });
    expect(reducer(s, { type: "pick", game: { ...g, marc: "bear", at: "2026-10-30T14:00:00.000Z" } }).games[g.id].marc).toBe("bear");
    const late = { ...g, marc: "bear" as const, at: "2026-10-30T21:00:00.000Z", kick: "2026-11-02" };
    expect(reducer(s, { type: "pick", game: late }).games[g.id].marc).toBe("bull");
    expect(reducer(s, { type: "remove", id: g.id }).games[g.id]).toBeUndefined();
  });

  it("stores owned tickers only", () => {
    let s = reducer(EMPTY_STATE, { type: "own", s: "msft", on: true });
    s = reducer(s, { type: "own", s: "AAPL", on: true });
    expect(s.owned).toEqual(["AAPL", "MSFT"]);
    expect(reducer(s, { type: "own", s: "MSFT", on: false }).owned).toEqual(["AAPL"]);
  });
});

describe("backups", () => {
  it("restore what was saved", () => {
    const s = reducer(reducer(EMPTY_STATE, { type: "pick", game: g }), { type: "own", s: "KO", on: true });
    expect(parseBackup(backupText(s))).toEqual(s);
  });
  it("reject other files with a plain message", () => {
    expect(() => parseBackup("{}")).toThrow("isn't a Marc vs. Cramer backup");
    expect(() => parseBackup("hello")).toThrow("isn't a Marc vs. Cramer backup");
  });
});
