// Obviously made-up demo content: Cramer calls and a watchlist. No accounts or amounts.
import type { AppState, CramerCall, WatchItem } from "./types";
import { addDays, todayET } from "./dates";
import { newId } from "./storage";

export function sampleCalls(today = todayET()): CramerCall[] {
  const c = (symbol: string, action: CramerCall["action"], daysAgo: number, segment?: string): CramerCall => ({
    id: newId(),
    symbol,
    action,
    date: addDays(today, -daysAgo),
    segment,
    note: "Sample call, made up for the demo",
    sample: true,
    createdAt: new Date().toISOString(),
  });
  return [
    c("NVDA", "buy", 420, "Lightning Round"),
    c("INTC", "sell", 330, "Lightning Round"),
    c("AAPL", "buy", 210, "Interview"),
    c("F", "sell", 150, "Off the Charts"),
    c("DIS", "hold", 95, "Am I Diversified?"),
    c("COST", "buy", 70),
    c("NKE", "sell", 45, "Lightning Round"),
    c("PLTR", "buy", 21, "Lightning Round"),
  ];
}

export const SAMPLE_WATCH = ["TSLA", "AMD", "LLY", "SOFI", "MSFT"];

export function sampleWatchlist(today = todayET()): WatchItem[] {
  return SAMPLE_WATCH.map((symbol, i) => ({ symbol, addedOn: addDays(today, -30 * (i + 1)), sample: true }));
}

export function withSample(state: AppState): AppState {
  return {
    ...state,
    onboarded: true,
    sampleMode: true,
    calls: [...sampleCalls(), ...state.calls.filter((c) => !c.sample)],
    watchlist: [...sampleWatchlist(), ...state.watchlist.filter((w) => !w.sample && !SAMPLE_WATCH.includes(w.symbol))],
  };
}

export function withoutSample(state: AppState): AppState {
  return { ...state, sampleMode: false, calls: state.calls.filter((c) => !c.sample), watchlist: state.watchlist.filter((w) => !w.sample) };
}
