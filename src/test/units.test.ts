import { describe, expect, it } from "vitest";
import { decodeDataset } from "../lib/data";
import { fmtDuration, fmtMoney, fmtMoneyShort, fmtMultiple, fmtPct } from "../lib/format";
import { clearLegacy, DEFAULT_STATE, parseState, STORAGE_KEY } from "../lib/store";
import { searchAssets } from "../components/StockSheet";
import { parseAmount } from "../components/AmountSheet";
import { layoutLabels } from "../components/Chart";
import { makeSynthetic } from "./synthetic";

describe("format", () => {
  it("rounds money to whole dollars", () => {
    expect(fmtMoney(2208071.6)).toBe("$2,208,072");
    expect(fmtMoney(0.4)).toBe("$0");
  });
  it("shortens money for tight spots", () => {
    expect(fmtMoneyShort(2208072)).toBe("$2.21M");
    expect(fmtMoneyShort(204815)).toBe("$205K");
    expect(fmtMoneyShort(30000)).toBe("$30K");
    expect(fmtMoneyShort(12500)).toBe("$12.5K");
    expect(fmtMoneyShort(950)).toBe("$950");
    expect(fmtMoneyShort(1.5e9)).toBe("$1.5B");
  });
  it("formats signed percents with a real minus sign", () => {
    expect(fmtPct(72.6)).toBe("+7,260%");
    expect(fmtPct(-0.6134)).toBe("\u221261%");
    expect(fmtPct(0.0412)).toBe("+4.1%");
    expect(fmtPct(-0.6134, false)).toBe("61%");
    expect(fmtPct(0.0001)).toBe("0%");
  });
  it("formats multiples and durations", () => {
    expect(fmtMultiple(73.6)).toBe("73.6\u00d7");
    expect(fmtMultiple(2.034)).toBe("2.03\u00d7");
    expect(fmtMultiple(143.4)).toBe("143\u00d7");
    expect(fmtDuration(5)).toBe("5 days");
    expect(fmtDuration(21)).toBe("3 weeks");
    expect(fmtDuration(274)).toBe("9 months");
    expect(fmtDuration(851)).toBe("2 years, 4 months");
    expect(fmtDuration(730)).toBe("2 years");
  });
});

describe("store", () => {
  it("falls back to the default for missing or broken data", () => {
    expect(parseState(null)).toEqual(DEFAULT_STATE);
    expect(parseState("{nope")).toEqual(DEFAULT_STATE);
  });
  it("keeps valid fields and drops invalid ones", () => {
    const s = parseState(
      JSON.stringify({
        symbol: "BTC-USD",
        start: { kind: "moment", id: "sb52" },
        amount: 1500.4,
        real: true,
        saved: [{ id: "a", name: "Birthday", m: 300 }, { id: "b", name: "", m: 3 }, { id: "c", name: "x", m: -4 }, "junk"],
      }),
    );
    expect(s).toEqual({ symbol: "BTC-USD", start: { kind: "moment", id: "sb52" }, amount: 1500, real: true, saved: [{ id: "a", name: "Birthday", m: 300 }] });
    expect(parseState(JSON.stringify({ amount: 1e12, symbol: "<script>", start: { kind: "month", m: 9e9 } }))).toMatchObject({
      amount: DEFAULT_STATE.amount,
      symbol: DEFAULT_STATE.symbol,
      start: DEFAULT_STATE.start,
    });
  });
  it("removes only the two earlier apps' leftovers", () => {
    localStorage.clear();
    localStorage.setItem("marcsapp:v1", "accounts");
    localStorage.setItem("birdseye-store", "x");
    localStorage.setItem("marc-vs-cramer:v1", "picks");
    localStorage.setItem(STORAGE_KEY, "{}");
    clearLegacy();
    expect(Object.keys(localStorage).sort()).toEqual(["hindsight:v1", "marc-vs-cramer:v1"]);
  });
});

describe("amount input", () => {
  it("accepts whole dollars in range", () => {
    expect(parseAmount("30,000")).toBe(30000);
    expect(parseAmount("$1")).toBe(1);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("100000001")).toBeNull();
  });
});

describe("search", () => {
  const syn = makeSynthetic();
  const ds = decodeDataset(syn.raw, syn.more);
  const assets = ds.order.map((s) => ds.assets.get(s)!);
  it("finds by ticker, name, and old names", () => {
    expect(searchAssets(assets, "up")[0].symbol).toBe("UP");
    expect(searchAssets(assets, "old name")[0].symbol).toBe("UP");
    expect(searchAssets(assets, "OLD")[0].symbol).toBe("UP");
    expect(searchAssets(assets, "coin")[0].symbol).toBe("BTC");
    expect(searchAssets(assets, "zzz")).toEqual([]);
    expect(searchAssets(assets, "  ")).toEqual([]);
  });
});

describe("chart labels", () => {
  it("keeps right-gutter labels apart and inside the plot", () => {
    const ys = layoutLabels(
      [
        { y: 100, h: 38 },
        { y: 105, h: 38 },
        { y: 230, h: 38 },
      ],
      0,
      240,
    );
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(38);
    expect(ys[2] + 19).toBeLessThanOrEqual(240);
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(38);
  });
});
