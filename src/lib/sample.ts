// Obviously fake demo data. Percentages only, every item flagged `sample`.
import type { Account, AppState, CramerCall, WatchItem } from "./types";
import { addDays, todayET } from "./dates";
import { newId } from "./storage";

export function sampleAccounts(): Account[] {
  const h = (symbol: string, pct: number) => ({ id: newId(), kind: "pct" as const, symbol, pct });
  const cash = (pct: number) => ({ id: newId(), kind: "cash" as const, pct });
  return [
    {
      id: newId(),
      name: "Sample Brokerage",
      type: "Brokerage",
      portfolioPct: 35,
      sample: true,
      holdings: [h("VOO", 34), h("AAPL", 12), h("NVDA", 10), h("QQQ", 14), h("MSFT", 8), h("COST", 6), h("JPM", 6), cash(10)],
    },
    {
      id: newId(),
      name: "Sample Roth IRA",
      type: "Roth IRA",
      portfolioPct: 15,
      sample: true,
      holdings: [h("VTI", 40), h("SCHD", 30), h("AAPL", 15), h("AMZN", 15)],
    },
    {
      id: newId(),
      name: "Sample 401(k)",
      type: "401(k)",
      portfolioPct: 40,
      sample: true,
      holdings: [h("FXAIX", 55), h("FTIHX", 20), h("FXNAX", 15), h("Stable Value Fund", 10)],
    },
    {
      id: newId(),
      name: "Sample HSA",
      type: "HSA",
      portfolioPct: 10,
      sample: true,
      holdings: [h("VTTSX", 70), cash(30)],
    },
  ];
}

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
    c("COST", "buy", 70, "Main segment"),
    c("NKE", "sell", 45, "Lightning Round"),
    c("PLTR", "buy", 21, "Lightning Round"),
  ];
}

export function sampleWatchlist(today = todayET()): WatchItem[] {
  return ["TSLA", "AMD", "LLY", "SOFI"].map((symbol, i) => ({ symbol, addedOn: addDays(today, -30 * (i + 1)), sample: true }));
}

export function withSample(state: AppState): AppState {
  return {
    ...state,
    onboarded: true,
    sampleMode: true,
    accounts: [...sampleAccounts(), ...state.accounts.filter((a) => !a.sample)],
    calls: [...sampleCalls(), ...state.calls.filter((c) => !c.sample)],
    watchlist: [...sampleWatchlist(), ...state.watchlist.filter((w) => !w.sample)],
  };
}

export function withoutSample(state: AppState): AppState {
  return {
    ...state,
    sampleMode: false,
    accounts: state.accounts.filter((a) => !a.sample),
    calls: state.calls.filter((c) => !c.sample),
    watchlist: state.watchlist.filter((w) => !w.sample),
  };
}
