// Golden tests: the app's engine, run on a frozen snapshot of real Yahoo and FRED data (taken Nov 6, 2026,
// prices through the Nov 5 close), must match numbers an independent agent recomputed in Python from the
// raw Yahoo and FRED downloads. Stored prices carry 10 significant digits (monthly anchors 5e-9 relative),
// so values agree within about 6 parts per billion and every whole-dollar figure under $50M matches exactly.
import { describe, expect, it } from "vitest";
import dataset from "./fixtures/golden-dataset.json";
import expected from "./fixtures/golden-expected.json";
import type { RawDataset } from "../lib/data";
import { decodeDataset, isoToDay, monthIndexOf } from "../lib/data";
import type { StartRef } from "../lib/engine";
import { computeScenario, cpiAt, latestCpi } from "../lib/engine";
import { fmtDay, fmtMoney } from "../lib/format";

const ds = decodeDataset(dataset as unknown as RawDataset);
const REL = 6e-9;
const MOMENT_IDS: Record<string, string> = { "2018-02-04": "sb52", "2007-10-09": "peak07" };

interface Expected {
  id: string;
  symbol: string;
  amount: number;
  mode: "nominal" | "real";
  start_kind: "month" | "moment";
  start_ref: string;
  start_date: string;
  end_date: string;
  cpi_start?: number;
  cpi_L: number;
  invested: number;
  value: number;
  gain: number;
  sp_start_date: string;
  sp_end_date: string;
  sp_value: number;
  dd: null | { peak_date: string; peak_value: number; trough_date: string; trough_value: number; rec_date: string | null; rec_value: number | null; pct: number };
  value_cents?: number;
}

const close = (a: number, b: number, rel = REL) => expect(Math.abs(a - b)).toBeLessThanOrEqual(Math.max(1e-9, Math.abs(b) * rel));
/** Whole-dollar display must match unless the true value sits within a hair of a half dollar. */
const sameDollars = (a: number, b: number) => {
  if (b >= 5e7 || Math.abs((b % 1) - 0.5) < 0.01) return;
  expect(fmtMoney(a)).toBe(fmtMoney(b));
};
const d = (iso: string) => fmtDay(isoToDay(iso));

describe("golden scenarios match an independent recomputation from raw data", () => {
  it("uses the same CPI, including the filled October 2025", () => {
    expect(latestCpi(ds)).toBe(336.298);
    expect(cpiAt(ds, isoToDay("2025-10-15"))).toBe(324.654);
    expect(ds.cpi.filled).toEqual(["2025-10"]);
  });

  for (const e of expected as Expected[]) {
    it(`${e.id}: ${e.symbol} ${e.mode} from ${e.start_ref}`, () => {
      const start: StartRef =
        e.start_kind === "moment"
          ? { kind: "moment", id: MOMENT_IDS[e.start_ref] }
          : { kind: "month", m: monthIndexOf(Number(e.start_ref.slice(0, 4)), Number(e.start_ref.slice(5, 7)) - 1) };
      const sc = computeScenario(ds, { symbol: e.symbol, start, amount: e.amount, real: e.mode === "real" })!;
      expect(sc).not.toBeNull();
      expect(fmtDay(sc.startDay)).toBe(d(e.start_date));
      expect(fmtDay(sc.endDay)).toBe(d(e.end_date));
      close(sc.invested, e.invested, 1e-12);
      close(sc.value, e.value);
      sameDollars(sc.value, e.value);
      close(sc.gain, e.gain, 1e-7);
      if (e.value_cents != null) expect(Math.round(sc.value * 100) / 100).toBe(e.value_cents);

      if (e.symbol === ds.benchmark) {
        expect(sc.sp).toBeNull();
      } else {
        expect(fmtDay(sc.sp!.startDay)).toBe(d(e.sp_start_date));
        expect(fmtDay(sc.sp!.endDay)).toBe(d(e.sp_end_date));
        close(sc.sp!.value, e.sp_value);
        sameDollars(sc.sp!.value, e.sp_value);
      }

      if (!e.dd) {
        expect(sc.dd).toBeNull();
      } else {
        expect(fmtDay(sc.dd!.peak.day)).toBe(d(e.dd.peak_date));
        expect(fmtDay(sc.dd!.trough.day)).toBe(d(e.dd.trough_date));
        expect(sc.dd!.rec ? fmtDay(sc.dd!.rec.day) : null).toBe(e.dd.rec_date ? d(e.dd.rec_date) : null);
        close(sc.dd!.peak.value, e.dd.peak_value);
        close(sc.dd!.trough.value, e.dd.trough_value);
        sameDollars(sc.dd!.trough.value, e.dd.trough_value);
        expect(Math.abs(sc.dd!.pct - e.dd.pct)).toBeLessThan(1e-8);
      }
    });
  }
});
