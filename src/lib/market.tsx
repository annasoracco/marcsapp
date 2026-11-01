import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { FundsFile, HistoryFile, MarketData, MarketFile, Meta, NewsFile, Series } from "./marketTypes";
import { decodeHistory, historyFileName, withQuote } from "./history";

export type MarketState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: MarketData };

export interface MarketSource {
  loadData(): Promise<MarketData>;
  loadHistory(symbol: string): Promise<Series | null>;
}

const DATA_BASE = `${import.meta.env.BASE_URL}data/`;

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${DATA_BASE}${path}`, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const httpSource: MarketSource = {
  async loadData() {
    const [meta, market, funds, news] = await Promise.all([
      getJson<Meta>("meta.json"),
      getJson<MarketFile>("market.json"),
      getJson<FundsFile>("funds.json").catch(() => ({ asOf: "", f: {} }) as FundsFile),
      getJson<NewsFile>("news.json").catch(() => ({ asOf: null, items: [] }) as NewsFile),
    ]);
    return { meta, market, funds, news };
  },
  async loadHistory(symbol) {
    try {
      const h = await getJson<HistoryFile>(`history/${encodeURIComponent(historyFileName(symbol))}`);
      return decodeHistory(h);
    } catch {
      return null;
    }
  },
};

interface MarketContextValue {
  state: MarketState;
  source: MarketSource;
  historyCache: Map<string, Promise<Series | null>>;
}

const MarketContext = createContext<MarketContextValue | null>(null);

export function MarketProvider({ children, source = httpSource }: { children: ReactNode; source?: MarketSource }) {
  const [state, setState] = useState<MarketState>({ status: "loading" });
  const historyCache = useMemo(() => new Map<string, Promise<Series | null>>(), []);
  useEffect(() => {
    let alive = true;
    source
      .loadData()
      .then((data) => alive && setState({ status: "ready", data }))
      .catch((e: unknown) => alive && setState({ status: "error", error: e instanceof Error ? e.message : String(e) }));
    return () => {
      alive = false;
    };
  }, [source]);
  const value = useMemo(() => ({ state, source, historyCache }), [state, source, historyCache]);
  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

function useMarketContext(): MarketContextValue {
  const v = useContext(MarketContext);
  if (!v) throw new Error("useMarket outside MarketProvider");
  return v;
}

export function useMarket(): MarketState {
  return useMarketContext().state;
}

/**
 * Loads daily history for the given symbols (brought up to date with the latest quote).
 * Values: undefined while loading, null when unavailable.
 */
export function useHistories(symbols: string[]): Record<string, Series | null | undefined> {
  const { state, source, historyCache } = useMarketContext();
  const key = [...new Set(symbols)].sort().join(",");
  const [loaded, setLoaded] = useState<Record<string, Series | null>>({});
  useEffect(() => {
    let alive = true;
    const list = key ? key.split(",") : [];
    for (const s of list) {
      let p = historyCache.get(s);
      if (!p) {
        p = source.loadHistory(s);
        historyCache.set(s, p);
      }
      p.then((series) => {
        if (alive) setLoaded((prev) => (prev[s] === series ? prev : { ...prev, [s]: series }));
      });
    }
    return () => {
      alive = false;
    };
  }, [key, source, historyCache]);
  const market = state.status === "ready" ? state.data.market : undefined;
  return useMemo(() => {
    const out: Record<string, Series | null | undefined> = {};
    for (const s of key ? key.split(",") : []) {
      const series = loaded[s];
      out[s] = series ? withQuote(series, market?.t[s]) : series;
    }
    return out;
  }, [key, loaded, market]);
}
