import { describe, expect, it } from "vitest";
import { decodeDataset, monthIndexOf } from "../lib/data";
import { computeScenario } from "../lib/engine";
import { CARD_H, CARD_W, drawShareCard } from "../lib/shareCard";
import { makeSynthetic } from "./synthetic";

/** A canvas stand-in that records what gets written and where. */
function fakeCtx() {
  const texts: { text: string; x: number; y: number; font: string }[] = [];
  const ctx = {
    font: "400 10px x",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineJoin: "",
    lineCap: "",
    textAlign: "left",
    textBaseline: "alphabetic",
    fillRect() {},
    fillText(text: string, x: number, y: number) {
      texts.push({ text, x, y, font: this.font });
    },
    measureText(text: string) {
      const size = Number(/(\d+)px/.exec(this.font)?.[1] ?? 10);
      return { width: text.length * size * 0.52 };
    },
    save() {},
    restore() {},
    setLineDash() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {},
    arc() {},
    fill() {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
}

const syn = makeSynthetic();
const ds = decodeDataset(syn.raw, syn.more);

describe("share card", () => {
  it("keeps every line inside the card, above the story-app safe zone, and at 36px or more", () => {
    const sc = computeScenario(ds, { symbol: "UP", start: { kind: "month", m: monthIndexOf(2007, 0) }, amount: 30000, real: false })!;
    const { ctx, texts } = fakeCtx();
    drawShareCard(ctx, sc, { cpiMonth: "Oct 2010", name: "Upward Co", isBenchmark: false });
    const all = texts.map((t) => t.text).join("");
    expect(all).toContain("I’d have");
    expect(all).toContain("my money");
    expect(all).toContain("The S&P 500 would have made it");
    expect(all).toContain("Hypothetical.");
    for (const t of texts) {
      expect(t.y).toBeLessThanOrEqual(CARD_H - 180 + 1);
      expect(t.x).toBeGreaterThanOrEqual(0);
      expect(t.x).toBeLessThanOrEqual(CARD_W);
      expect(Number(/(\d+)px/.exec(t.font)![1])).toBeGreaterThanOrEqual(36);
    }
  });

  it("only calls the benchmark itself the whole S&P 500", () => {
    const sc = computeScenario(ds, { symbol: "BTC", start: { kind: "month", m: monthIndexOf(2008, 2) }, amount: 1000, real: false })!;
    const noComparison = { ...sc, sp: null };
    const { ctx, texts } = fakeCtx();
    drawShareCard(ctx, noComparison, { cpiMonth: "Oct 2010", name: "Coin", isBenchmark: false });
    expect(texts.map((t) => t.text).join("")).not.toContain("whole S&P 500");
    const bench = fakeCtx();
    drawShareCard(bench.ctx, noComparison, { cpiMonth: "Oct 2010", name: "S&P 500", isBenchmark: true });
    expect(bench.texts.map((t) => t.text).join("")).toContain("whole S&P 500");
  });
});

