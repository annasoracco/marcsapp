import { ACCOUNT_TYPES, type Account, type AppState, type CramerCall, type Holding, type WatchItem } from "./types";
import { isIsoDate } from "./dates";
import { normalizeSymbol } from "./history";

export const STORAGE_KEY = "marcsapp:v1";

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultState(): AppState {
  return {
    version: 1,
    onboarded: false,
    sampleMode: false,
    accounts: [],
    calls: [],
    watchlist: [],
    settings: { concentrationPct: 10 },
  };
}

const num = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
const str = (x: unknown, max = 200): string | undefined => (typeof x === "string" ? x.slice(0, max) : undefined);
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});

function sanitizeHolding(raw: unknown): Holding | null {
  const h = obj(raw);
  const id = str(h.id, 80) || newId();
  if (h.kind === "shares") {
    const symbol = normalizeSymbol(str(h.symbol, 20) ?? "");
    const shares = num(h.shares);
    return symbol && shares !== undefined && shares >= 0 ? { id, kind: "shares", symbol, shares } : null;
  }
  if (h.kind === "pct") {
    const symbol = (str(h.symbol, 80) ?? "").trim();
    const pct = num(h.pct);
    return symbol && pct !== undefined && pct >= 0 ? { id, kind: "pct", symbol, pct: Math.min(pct, 100) } : null;
  }
  if (h.kind === "cash") {
    const pct = num(h.pct);
    return pct !== undefined && pct >= 0 ? { id, kind: "cash", pct: Math.min(pct, 100) } : null;
  }
  return null;
}

function sanitizeAccount(raw: unknown): Account | null {
  const a = obj(raw);
  const name = (str(a.name, 60) ?? "").trim();
  if (!name) return null;
  const type = ACCOUNT_TYPES.includes(a.type as Account["type"]) ? (a.type as Account["type"]) : "Other";
  const portfolioPct = num(a.portfolioPct);
  return {
    id: str(a.id, 80) || newId(),
    name,
    type,
    portfolioPct: portfolioPct !== undefined && portfolioPct > 0 ? Math.min(portfolioPct, 100) : undefined,
    holdings: (Array.isArray(a.holdings) ? a.holdings : []).map(sanitizeHolding).filter((h): h is Holding => !!h),
    sample: a.sample === true || undefined,
  };
}

function sanitizeCall(raw: unknown): CramerCall | null {
  const c = obj(raw);
  const symbol = normalizeSymbol(str(c.symbol, 20) ?? "");
  const action = c.action === "buy" || c.action === "sell" || c.action === "hold" ? c.action : null;
  if (!symbol || !action || !isIsoDate(c.date)) return null;
  return {
    id: str(c.id, 80) || newId(),
    symbol,
    action,
    date: c.date,
    segment: str(c.segment, 60) || undefined,
    note: str(c.note, 280) || undefined,
    sample: c.sample === true || undefined,
    createdAt: str(c.createdAt, 40) || new Date().toISOString(),
  };
}

function sanitizeWatch(raw: unknown): WatchItem | null {
  const w = obj(raw);
  const symbol = normalizeSymbol(str(w.symbol, 20) ?? "");
  if (!symbol) return null;
  return { symbol, addedOn: isIsoDate(w.addedOn) ? w.addedOn : new Date().toISOString().slice(0, 10), sample: w.sample === true || undefined };
}

export function sanitizeState(raw: unknown): AppState {
  const s = obj(raw);
  const d = defaultState();
  const settings = obj(s.settings);
  const conc = num(settings.concentrationPct);
  const watch = (Array.isArray(s.watchlist) ? s.watchlist : []).map(sanitizeWatch).filter((w): w is WatchItem => !!w);
  return {
    version: 1,
    onboarded: s.onboarded === true,
    sampleMode: s.sampleMode === true,
    accounts: (Array.isArray(s.accounts) ? s.accounts : []).map(sanitizeAccount).filter((a): a is Account => !!a),
    calls: (Array.isArray(s.calls) ? s.calls : []).map(sanitizeCall).filter((c): c is CramerCall => !!c),
    watchlist: watch.filter((w, i) => watch.findIndex((x) => x.symbol === w.symbol) === i),
    settings: {
      concentrationPct: conc !== undefined && conc >= 1 && conc <= 100 ? conc : d.settings.concentrationPct,
      installTipDismissed: settings.installTipDismissed === true || undefined,
    },
  };
}

export function loadState(storage: Storage | undefined = globalThis.localStorage): AppState {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? sanitizeState(JSON.parse(raw)) : defaultState();
  } catch {
    return defaultState();
  }
}

export function saveState(state: AppState, storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked; nothing else we can do */
  }
}

export interface Backup {
  app: "marcsapp";
  kind: "backup";
  version: 1;
  exportedAt: string;
  data: AppState;
}

export function makeBackup(state: AppState, now = new Date()): Backup {
  return { app: "marcsapp", kind: "backup", version: 1, exportedAt: now.toISOString(), data: state };
}

export function parseBackup(text: string): AppState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a Marc's App backup (it isn't valid JSON).");
  }
  const b = obj(parsed);
  if (b.app !== "marcsapp" || b.kind !== "backup") throw new Error("That file isn't a Marc's App backup.");
  const state = sanitizeState(b.data);
  return { ...state, onboarded: true };
}
