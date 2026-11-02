import type { AppState, CramerCall, WatchItem } from "./types";
import { isIsoDate } from "./dates";
import { normalizeSymbol } from "./history";

export const STORAGE_KEY = "birdseye:v2";
/** Keys written by older versions. Removed on load so no account or holding data lingers. */
export const LEGACY_KEYS = ["marcsapp:v1"];
const LEGACY_PATTERN = /^(marcsapp|birdseye)[:_-].*(account|holding|portfolio|position)/i;

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function defaultState(): AppState {
  return { version: 2, onboarded: false, sampleMode: false, calls: [], watchlist: [], settings: {} };
}

const str = (x: unknown, max = 200): string | undefined => (typeof x === "string" ? x.slice(0, max) : undefined);
const obj = (x: unknown): Record<string, unknown> => (x && typeof x === "object" ? (x as Record<string, unknown>) : {});

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

/**
 * Builds a clean state from anything (older versions, backups, hand-edited files). Only calls,
 * the watchlist, and settings survive; accounts, holdings, and every other field are dropped.
 */
export function sanitizeState(raw: unknown): AppState {
  const s = obj(raw);
  const settings = obj(s.settings);
  const watch = (Array.isArray(s.watchlist) ? s.watchlist : []).map(sanitizeWatch).filter((w): w is WatchItem => !!w);
  const calls = (Array.isArray(s.calls) ? s.calls : []).map(sanitizeCall).filter((c): c is CramerCall => !!c);
  return {
    version: 2,
    onboarded: s.onboarded === true,
    sampleMode: s.sampleMode === true && (calls.some((c) => c.sample) || watch.some((w) => w.sample)),
    calls,
    watchlist: watch.filter((w, i) => watch.findIndex((x) => x.symbol === w.symbol) === i),
    settings: settings.installTipDismissed === true ? { installTipDismissed: true } : {},
  };
}

/**
 * Loads state and migrates older versions: their calls, watchlist, and settings are kept, and
 * the old keys (which could hold accounts and holdings) are deleted from this device.
 */
export function loadState(storage: Storage | undefined = globalThis.localStorage): AppState {
  try {
    if (!storage) return defaultState();
    const current = storage.getItem(STORAGE_KEY);
    let state: AppState | null = null;
    try {
      state = current ? sanitizeState(JSON.parse(current)) : null;
    } catch {
      state = null;
    }
    for (const key of LEGACY_KEYS) {
      const old = storage.getItem(key);
      if (old === null) continue;
      if (!state) {
        try {
          state = sanitizeState(JSON.parse(old));
        } catch {
          /* unreadable legacy data is simply dropped */
        }
      }
      storage.removeItem(key);
    }
    for (let i = storage.length - 1; i >= 0; i--) {
      const k = storage.key(i);
      if (k && LEGACY_PATTERN.test(k)) storage.removeItem(k);
    }
    const result = state ?? defaultState();
    storage.setItem(STORAGE_KEY, JSON.stringify(result));
    return result;
  } catch {
    return defaultState();
  }
}

/** Older builds never used IndexedDB, but delete any database under our names just in case. */
export function purgeLegacyDatabases(): void {
  try {
    if (typeof indexedDB === "undefined") return;
    for (const name of ["marcsapp", "marcsapp-accounts", "birdseye-accounts"]) indexedDB.deleteDatabase(name);
  } catch {
    /* not available */
  }
}

export function saveState(state: AppState, storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked */
  }
}

export interface Backup {
  app: "birdseye";
  kind: "backup";
  version: 2;
  exportedAt: string;
  data: Pick<AppState, "calls" | "watchlist" | "settings">;
}

export function makeBackup(state: AppState, now = new Date()): Backup {
  return {
    app: "birdseye",
    kind: "backup",
    version: 2,
    exportedAt: now.toISOString(),
    data: { calls: state.calls, watchlist: state.watchlist, settings: state.settings },
  };
}

/** Accepts Bird's Eye backups and older Marc's App backups; only calls, watchlist, and settings are read. */
export function parseBackup(text: string): AppState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a Bird's Eye backup (it isn't valid JSON).");
  }
  const b = obj(parsed);
  if ((b.app !== "birdseye" && b.app !== "marcsapp") || b.kind !== "backup") throw new Error("That file isn't a Bird's Eye backup.");
  const d = obj(b.data);
  return { ...sanitizeState({ calls: d.calls, watchlist: d.watchlist, settings: d.settings }), onboarded: true };
}
