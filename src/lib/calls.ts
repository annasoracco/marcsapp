import type { CramerCall } from "./types";
import type { Series } from "./marketTypes";
import { daysBetween } from "./dates";
import { indexOnOrBefore } from "./history";

export type CallStatus = "ok" | "pending" | "loading" | "nodata" | "tooold" | "uncovered";

export interface CallResult {
  call: CramerCall;
  status: CallStatus;
  /** Trading day whose close is the starting point (the show airs after the close). */
  baseDate?: string;
  /** Latest bar used for "now". */
  lastDate?: string;
  /** Stock return since the call, fraction. */
  stockRet?: number;
  /** S&P 500 (SPY) return over the same window, fraction. */
  marketRet?: number;
  /** stockRet - marketRet */
  excess?: number;
  /** Direction-adjusted excess: positive means the call was right. Undefined for Holds. */
  edge?: number;
  /** Buy that beat the market, or Sell that lagged it. Null for Holds. */
  right?: boolean | null;
  days?: number;
  /** First date with data, for the "too far back" message. */
  dataStart?: string;
}

export const BENCHMARK = "SPY";

/**
 * Measures a call from the close on (or the last close before) the call date to the latest
 * price, and compares it with SPY over exactly the same window.
 */
export function evaluateCall(
  call: CramerCall,
  stock: Series | null | undefined,
  market: Series | null | undefined,
  covered: boolean,
): CallResult {
  if (!covered) return { call, status: "uncovered" };
  if (stock === undefined || market === undefined) return { call, status: "loading" };
  if (!stock || !market || stock.dates.length === 0 || market.dates.length === 0) return { call, status: "nodata" };

  const iS = indexOnOrBefore(stock, call.date);
  const iM = indexOnOrBefore(market, call.date);
  if (iS < 0 || iM < 0) return { call, status: "tooold", dataStart: stock.dates[0] > market.dates[0] ? stock.dates[0] : market.dates[0] };

  const lastS = stock.closes.length - 1;
  const lastM = market.closes.length - 1;
  const baseDate = stock.dates[iS];
  const lastDate = stock.dates[lastS];
  if (iS === lastS) {
    return { call, status: "pending", baseDate, lastDate, stockRet: 0, marketRet: 0, excess: 0, days: 0 };
  }

  const stockRet = stock.closes[lastS] / stock.closes[iS] - 1;
  const marketRet = market.closes[lastM] / market.closes[iM] - 1;
  const excess = stockRet - marketRet;
  const edge = call.action === "buy" ? excess : call.action === "sell" ? -excess : undefined;
  const right = call.action === "hold" ? null : (edge ?? 0) > 0;
  return {
    call,
    status: "ok",
    baseDate,
    lastDate,
    stockRet,
    marketRet,
    excess,
    edge,
    right,
    days: daysBetween(baseDate, lastDate),
  };
}

export interface Scorecard {
  /** Buy and Sell calls with results. */
  graded: number;
  right: number;
  hitRate: number | null;
  /** Average direction-adjusted excess return vs the S&P 500. */
  avgEdge: number | null;
  /** Average return of following the calls (buy the Buys, short the Sells). */
  avgFollow: number | null;
  /** Average return of doing the opposite of every call. */
  avgInverse: number | null;
  /** Average S&P 500 return over the same windows. */
  avgMarket: number | null;
  /** Average stock-minus-market for Buy calls only. */
  avgBuyExcess: number | null;
  buys: number;
  sells: number;
  holds: number;
  pending: number;
  best?: CallResult;
  worst?: CallResult;
  verdict: "cramer" | "inverse" | "tie" | null;
}

const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function scorecard(results: CallResult[]): Scorecard {
  const graded = results.filter((r) => r.status === "ok" && r.call.action !== "hold");
  const right = graded.filter((r) => r.right).length;
  const follow = graded.map((r) => (r.call.action === "buy" ? r.stockRet! : -r.stockRet!));
  const sorted = [...graded].sort((a, b) => b.edge! - a.edge!);
  const hitRate = graded.length ? right / graded.length : null;
  const buys = graded.filter((r) => r.call.action === "buy");
  return {
    graded: graded.length,
    right,
    hitRate,
    avgEdge: mean(graded.map((r) => r.edge!)),
    avgFollow: mean(follow),
    avgInverse: mean(follow.map((x) => -x)),
    avgMarket: mean(graded.map((r) => r.marketRet!)),
    avgBuyExcess: mean(buys.map((r) => r.excess!)),
    buys: buys.length,
    sells: graded.length - buys.length,
    holds: results.filter((r) => r.call.action === "hold").length,
    pending: results.filter((r) => r.status === "pending").length,
    best: sorted[0],
    worst: sorted.length > 1 ? sorted[sorted.length - 1] : undefined,
    verdict: hitRate === null ? null : hitRate > 0.5 ? "cramer" : hitRate < 0.5 ? "inverse" : "tie",
  };
}

export const SEGMENTS = [
  "Lightning Round",
  "Interview",
  "Off the Charts",
  "Executive Decision",
  "Am I Diversified?",
  "Game Plan",
  "Main segment",
  "Other",
] as const;

export const ACTION_LABEL: Record<CramerCall["action"], string> = { buy: "Buy", sell: "Sell", hold: "Hold" };
