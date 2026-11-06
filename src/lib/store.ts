// Marc's scenario and saved dates live only in this browser's localStorage. Nothing is ever sent anywhere.
import type { StartRef } from "./engine";
import { DEFAULT_INPUT } from "./engine";

export const STORAGE_KEY = "hindsight:v1";
// Data left on the phone by the two earlier apps at this address, which stored account details.
const LEGACY_KEY = /^(marcsapp|birdseye)[:_-]/i;

export interface SavedDate {
  id: string;
  name: string;
  /** Month index since Jan 1988. */
  m: number;
}

export interface AppState {
  symbol: string;
  start: StartRef;
  amount: number;
  real: boolean;
  saved: SavedDate[];
}

export const DEFAULT_STATE: AppState = { ...DEFAULT_INPUT, saved: [] };

export const MIN_AMOUNT = 1;
export const MAX_AMOUNT = 100_000_000;

const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);

function validStart(x: unknown): StartRef | null {
  if (!x || typeof x !== "object") return null;
  const s = x as Record<string, unknown>;
  if (s.kind === "month" && isInt(s.m) && s.m >= 0 && s.m < 2400) return { kind: "month", m: s.m };
  if (s.kind === "moment" && typeof s.id === "string" && s.id.length < 40) return { kind: "moment", id: s.id };
  return null;
}

export function parseState(raw: string | null): AppState {
  if (!raw) return DEFAULT_STATE;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const amount = Number(o.amount);
    const saved = Array.isArray(o.saved)
      ? o.saved
          .filter(
            (d): d is SavedDate =>
              !!d &&
              typeof d.id === "string" &&
              typeof d.name === "string" &&
              d.name.trim().length > 0 &&
              isInt(d.m) &&
              d.m >= 0 &&
              d.m < 2400,
          )
          .slice(0, 50)
          .map((d) => ({ id: d.id, name: d.name.slice(0, 40), m: d.m }))
      : [];
    return {
      symbol: typeof o.symbol === "string" && /^[\w^.=-]{1,15}$/.test(o.symbol) ? o.symbol : DEFAULT_STATE.symbol,
      start: validStart(o.start) ?? DEFAULT_STATE.start,
      amount: Number.isFinite(amount) && amount >= MIN_AMOUNT && amount <= MAX_AMOUNT ? Math.round(amount) : DEFAULT_STATE.amount,
      real: o.real === true,
      saved,
    };
  } catch {
    return DEFAULT_STATE;
  }
}

export function loadState(storage: Storage | undefined = globalThis.localStorage): AppState {
  try {
    return parseState(storage?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveState(state: AppState, storage: Storage | undefined = globalThis.localStorage): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* private mode or full storage: the app still works, it just won't remember */
  }
}

export function clearLegacy(storage: Storage | undefined = globalThis.localStorage): void {
  if (!storage) return;
  try {
    const old: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && LEGACY_KEY.test(k)) old.push(k);
    }
    old.forEach((k) => storage.removeItem(k));
  } catch {
    /* ignore */
  }
}
