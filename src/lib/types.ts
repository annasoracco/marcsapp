// The only things Bird's Eye stores, all on this device: Cramer calls (public information),
// a list of tickers Marc is watching (no amounts), and display settings.
// There are deliberately no accounts, holdings, share counts, or balances anywhere.

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

export interface WatchItem {
  symbol: string;
  /** YYYY-MM-DD */
  addedOn: string;
  sample?: boolean;
}

export interface Settings {
  installTipDismissed?: boolean;
}

export interface AppState {
  version: 2;
  onboarded: boolean;
  sampleMode: boolean;
  calls: CramerCall[];
  watchlist: WatchItem[];
  settings: Settings;
}

/** The complete set of top-level keys a stored state may have. Enforced by the privacy tests. */
export const STATE_KEYS = ["version", "onboarded", "sampleMode", "calls", "watchlist", "settings"] as const;
