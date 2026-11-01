import { describe, expect, it } from "vitest";
import { accountWeights, buildXray, composeAccount } from "../lib/xray";
import { makeBackup, parseBackup, defaultState } from "../lib/storage";
import { withSample, withoutSample } from "../lib/sample";
import type { Account } from "../lib/types";
import { funds, market } from "./fixtures";

const acct = (id: string, holdings: Account["holdings"], portfolioPct?: number): Account => ({ id, name: id, type: "Brokerage", holdings, portfolioPct });

describe("X-ray", () => {
  it("mixes share-based and percent holdings inside an account", () => {
    const c = composeAccount(
      acct("a", [
        { id: "1", kind: "shares", symbol: "AAPL", shares: 10 }, // 2300
        { id: "2", kind: "shares", symbol: "MSFT", shares: 10 }, // 4200
        { id: "3", kind: "pct", symbol: "Stable Value", pct: 20 },
      ]),
      market,
    );
    const w = Object.fromEntries(c.positions.map((p) => [p.key, p.weight]));
    expect(w["LABEL:stable value"]).toBeCloseTo(0.2);
    expect(w.AAPL + w.MSFT).toBeCloseTo(0.8);
    expect(w.MSFT / w.AAPL).toBeCloseTo(4200 / 2300);
    expect(c.unassigned).toBe(0);
  });

  it("weights accounts by fixed share, value, or estimate", () => {
    const w = accountWeights([
      { account: acct("fixed", [], 50) },
      { account: acct("auto1", []), relSize: 3 },
      { account: acct("auto2", []), relSize: 1 },
    ]);
    expect(w.map((x) => x.weight)).toEqual([0.5, 0.375, 0.125]);
    const est = accountWeights([{ account: acct("x", []) }, { account: acct("y", []) }]);
    expect(est.every((e) => e.estimated && Math.abs(e.weight - 0.5) < 1e-9)).toBe(true);
  });

  it("finds overlap, concentration, sectors and look-through exposure", () => {
    const x = buildXray(
      [
        acct("one", [{ id: "1", kind: "pct", symbol: "AAPL", pct: 30 }, { id: "2", kind: "pct", symbol: "VOO", pct: 70 }], 50),
        acct("two", [{ id: "3", kind: "pct", symbol: "AAPL", pct: 10 }, { id: "4", kind: "pct", symbol: "FXNAX", pct: 60 }, { id: "5", kind: "cash", pct: 30 }], 50),
      ],
      market,
      funds,
      10,
    );
    const aapl = x.positions.find((p) => p.symbol === "AAPL")!;
    expect(aapl.weight).toBeCloseTo(0.2);
    expect(x.overlap.map((p) => p.symbol)).toEqual(["AAPL"]);
    expect(x.concentration.map((p) => p.key)).toContain("AAPL");
    const exp = x.exposures.find((e) => e.symbol === "AAPL")!;
    expect(exp.total).toBeCloseTo(0.2 + 0.35 * 0.07);
    expect(x.sectors.find((s) => s.label === "Bonds")!.weight).toBeCloseTo(0.3 * 0.98);
    expect(x.assetTypes.reduce((a, s) => a + s.weight, 0)).toBeCloseTo(1);
  });
});

describe("backup", () => {
  it("round-trips through export and import", () => {
    const s = withSample({ ...defaultState(), onboarded: true });
    const back = parseBackup(JSON.stringify(makeBackup(s)));
    expect(back.accounts).toHaveLength(s.accounts.length);
    expect(back.calls.map((c) => c.symbol)).toEqual(s.calls.map((c) => c.symbol));
  });

  it("rejects files that aren't backups", () => {
    expect(() => parseBackup("{}")).toThrow();
    expect(() => parseBackup("not json")).toThrow();
  });

  it("sample data is percent-only and removable", () => {
    const s = withSample(defaultState());
    expect(s.accounts.every((a) => a.holdings.every((h) => h.kind !== "shares"))).toBe(true);
    expect(s.accounts.every((a) => a.name.startsWith("Sample"))).toBe(true);
    const cleared = withoutSample(s);
    expect(cleared.accounts).toHaveLength(0);
    expect(cleared.calls).toHaveLength(0);
  });
});
