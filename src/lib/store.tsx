// Marc's own data: his picks, Cramer's calls as he confirmed them, and the tickers he owns.
// It lives only in this browser's localStorage. Nothing is ever sent anywhere.
import { createContext, useContext, useEffect, useMemo, useReducer, type Dispatch, type ReactNode } from "react";
import type { Final, Game, Side } from "./game";
import { isIsoDate } from "./dates";
import { normalizeSymbol } from "./history";

export const STORAGE_KEY = "marc-vs-cramer:v1";
const BACKUP_APP = "marc-vs-cramer";
/**
 * Earlier apps at this same address ("Marc's App" as marcsapp:*, "Bird's Eye" as birdseye:*) stored
 * accounts, share counts, and holdings on the phone. Nothing reads them anymore, so they're removed.
 */
const LEGACY_KEY = /^(marcsapp|birdseye)[:_-]/i;

export function clearLegacy(storage: Storage | undefined = globalThis.localStorage): void {
  try {
    if (!storage) return;
    const old: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && k !== STORAGE_KEY && LEGACY_KEY.test(k)) old.push(k);
    }
    for (const k of old) storage.removeItem(k);
  } catch {
    /* storage blocked; nothing to clean */
  }
}

export interface SavedState {
  games: Record<string, Game>;
  /** slate ids Marc marked "not a call" */
  hidden: string[];
  /** tickers only; never amounts */
  owned: string[];
}

export const EMPTY_STATE: SavedState = { games: {}, hidden: [], owned: [] };

const isSide = (x: unknown): x is Side => x === "bull" || x === "bear";
const str = (x: unknown, max = 400): x is string => typeof x === "string" && x.length > 0 && x.length <= max;
const num = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

function parseFinal(x: unknown): Final | undefined {
  if (!x || typeof x !== "object") return undefined;
  const f = x as Record<string, unknown>;
  if (isIsoDate(f.k) && isIsoDate(f.e) && num(f.sr) && num(f.br)) return { k: f.k, e: f.e, sr: f.sr, br: f.br };
  return undefined;
}

function parseGame(x: unknown): Game | null {
  if (!x || typeof x !== "object") return null;
  const g = x as Record<string, unknown>;
  if (!str(g.id, 40) || !str(g.s, 12) || !isIsoDate(g.air) || !isIsoDate(g.kick)) return null;
  if (!isSide(g.cramer) || !isSide(g.marc) || !str(g.at, 40) || Number.isNaN(Date.parse(g.at))) return null;
  const link = typeof g.link === "string" && /^https:\/\/www\.cnbc\.com\//.test(g.link) ? g.link : "";
  const game: Game = {
    id: g.id,
    s: g.s,
    n: str(g.n) ? g.n : g.s,
    air: g.air,
    title: typeof g.title === "string" ? g.title.slice(0, 400) : "",
    link,
    cramer: g.cramer,
    marc: g.marc,
    at: g.at,
    kick: g.kick,
  };
  const fin = parseFinal(g.fin);
  if (fin) game.fin = fin;
  return game;
}

export function parseState(raw: unknown): SavedState {
  if (!raw || typeof raw !== "object") return EMPTY_STATE;
  const r = raw as Record<string, unknown>;
  const games: Record<string, Game> = {};
  if (r.games && typeof r.games === "object") {
    for (const v of Object.values(r.games as Record<string, unknown>)) {
      const g = parseGame(v);
      if (g) games[g.id] = g;
    }
  }
  const hidden = Array.isArray(r.hidden) ? [...new Set(r.hidden.filter((h): h is string => str(h, 40)))] : [];
  const owned = Array.isArray(r.owned)
    ? [...new Set(r.owned.filter((s): s is string => str(s, 12)).map(normalizeSymbol))].sort()
    : [];
  return { games, hidden, owned };
}

export function loadState(storage: Storage | undefined = globalThis.localStorage): SavedState {
  clearLegacy(storage);
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? parseState(JSON.parse(raw)) : EMPTY_STATE;
  } catch {
    return EMPTY_STATE;
  }
}

export function saveState(state: SavedState, storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked (private mode); the app keeps working for this visit */
  }
}

export function backupText(state: SavedState, now = new Date()): string {
  return JSON.stringify({ app: BACKUP_APP, v: 1, savedAt: now.toISOString(), ...state }, null, 1);
}

/** Parses a backup file; throws a friendly message if it isn't one. */
export function parseBackup(text: string): SavedState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a Marc vs. Cramer backup.");
  }
  if (!raw || typeof raw !== "object" || (raw as { app?: unknown }).app !== BACKUP_APP) {
    throw new Error("That file isn't a Marc vs. Cramer backup.");
  }
  return parseState(raw);
}

export type Action =
  | { type: "pick"; game: Game }
  | { type: "remove"; id: string }
  | { type: "settle"; id: string; fin: Final }
  | { type: "hide"; id: string }
  | { type: "unhideAll" }
  | { type: "own"; s: string; on: boolean }
  | { type: "replace"; state: SavedState };

export function reducer(state: SavedState, action: Action): SavedState {
  switch (action.type) {
    case "pick": {
      const prev = state.games[action.game.id];
      // A settled matchup never changes, and a pick can't change once its kickoff close has passed.
      if (prev?.fin || (prev && action.game.kick > prev.kick)) return state;
      return {
        ...state,
        games: { ...state.games, [action.game.id]: action.game },
        hidden: state.hidden.filter((h) => h !== action.game.id),
      };
    }
    case "remove": {
      const g = state.games[action.id];
      if (!g || g.fin) return state;
      const games = { ...state.games };
      delete games[action.id];
      return { ...state, games };
    }
    case "settle": {
      const g = state.games[action.id];
      if (!g || g.fin) return state;
      return { ...state, games: { ...state.games, [action.id]: { ...g, fin: action.fin } } };
    }
    case "hide":
      return state.hidden.includes(action.id) ? state : { ...state, hidden: [...state.hidden, action.id] };
    case "unhideAll":
      return state.hidden.length ? { ...state, hidden: [] } : state;
    case "own": {
      const s = normalizeSymbol(action.s);
      if (!s) return state;
      const has = state.owned.includes(s);
      if (has === action.on) return state;
      const owned = action.on ? [...state.owned, s].sort() : state.owned.filter((o) => o !== s);
      return { ...state, owned };
    }
    case "replace":
      return action.state;
  }
}

interface StoreValue {
  state: SavedState;
  dispatch: Dispatch<Action>;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children, initial }: { children: ReactNode; initial?: SavedState }) {
  const [state, dispatch] = useReducer(reducer, initial, (init) => init ?? loadState());
  useEffect(() => saveState(state), [state]);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const v = useContext(StoreContext);
  if (!v) throw new Error("useStore outside StoreProvider");
  return v;
}
