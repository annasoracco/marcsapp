// The user's own data. Lives only in this browser's localStorage.

export type CallAction = "buy" | "sell" | "hold";

export interface CramerCall {
  id: string;
  symbol: string;
  action: CallAction;
  /** YYYY-MM-DD, the day the call aired */
  date: string;
  segment?: string;
  note?: string;
  sample?: boolean;
  createdAt: string;
}

export const ACCOUNT_TYPES = [
  "Brokerage",
  "Roth IRA",
  "Traditional IRA",
  "401(k)",
  "403(b)",
  "HSA",
  "529",
  "Other",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/**
 * A position inside an account.
 * - shares: a covered ticker plus a share count (only ever shown inside the edit form)
 * - pct: a ticker or a free-text fund name, as a percent of the account
 * - cash: cash or money market, as a percent of the account
 */
export type Holding =
  | { id: string; kind: "shares"; symbol: string; shares: number }
  | { id: string; kind: "pct"; symbol: string; pct: number }
  | { id: string; kind: "cash"; pct: number };

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  /** Optional: this account's share of the whole portfolio, in percent (0-100). */
  portfolioPct?: number;
  holdings: Holding[];
  sample?: boolean;
}

export interface WatchItem {
  symbol: string;
  /** YYYY-MM-DD */
  addedOn: string;
  sample?: boolean;
}

export interface Settings {
  /** Concentration alert threshold, percent of portfolio. */
  concentrationPct: number;
  installTipDismissed?: boolean;
}

export interface AppState {
  version: 1;
  onboarded: boolean;
  sampleMode: boolean;
  accounts: Account[];
  calls: CramerCall[];
  watchlist: WatchItem[];
  settings: Settings;
}
