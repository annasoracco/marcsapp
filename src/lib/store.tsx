import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from "react";
import type { Account, AppState, CramerCall, Settings, WatchItem } from "./types";
import { defaultState, loadState, saveState } from "./storage";
import { withSample, withoutSample } from "./sample";
import { normalizeSymbol } from "./history";
import { todayET } from "./dates";

type Action =
  | { type: "onboard"; sample: boolean }
  | { type: "saveCall"; call: CramerCall }
  | { type: "deleteCall"; id: string }
  | { type: "saveAccount"; account: Account }
  | { type: "deleteAccount"; id: string }
  | { type: "addWatch"; symbol: string }
  | { type: "removeWatch"; symbol: string }
  | { type: "settings"; patch: Partial<Settings> }
  | { type: "loadSample" }
  | { type: "clearSample" }
  | { type: "replace"; state: AppState }
  | { type: "reset" };

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return [item, ...list];
  const next = list.slice();
  next[i] = item;
  return next;
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "onboard":
      return action.sample ? withSample({ ...state, onboarded: true }) : { ...state, onboarded: true };
    case "saveCall":
      return { ...state, calls: upsert(state.calls, action.call) };
    case "deleteCall":
      return { ...state, calls: state.calls.filter((c) => c.id !== action.id) };
    case "saveAccount": {
      const exists = state.accounts.some((a) => a.id === action.account.id);
      return {
        ...state,
        accounts: exists ? state.accounts.map((a) => (a.id === action.account.id ? action.account : a)) : [...state.accounts, action.account],
      };
    }
    case "deleteAccount":
      return { ...state, accounts: state.accounts.filter((a) => a.id !== action.id) };
    case "addWatch": {
      const symbol = normalizeSymbol(action.symbol);
      if (!symbol || state.watchlist.some((w) => w.symbol === symbol)) return state;
      const item: WatchItem = { symbol, addedOn: todayET() };
      return { ...state, watchlist: [...state.watchlist, item] };
    }
    case "removeWatch":
      return { ...state, watchlist: state.watchlist.filter((w) => w.symbol !== action.symbol) };
    case "settings":
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case "loadSample":
      return withSample(state);
    case "clearSample":
      return withoutSample(state);
    case "replace":
      return action.state;
    case "reset":
      return defaultState();
  }
}

interface StoreValue {
  state: AppState;
  dispatch: (a: Action) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children, initial }: { children: ReactNode; initial?: AppState }) {
  const [state, dispatch] = useReducer(reducer, initial, (init) => init ?? loadState());
  useEffect(() => {
    saveState(state);
  }, [state]);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error("useStore outside StoreProvider");
  return v;
}
