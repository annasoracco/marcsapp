import { useMemo } from "react";
import { useStore } from "./store";
import { useHistories, useMarket } from "./market";
import { BENCHMARK, evaluateCall, scorecard } from "./calls";
import type { Tag } from "./insights";

export function useCallResults() {
  const { state } = useStore();
  const ms = useMarket();
  const market = ms.status === "ready" ? ms.data.market : undefined;
  const symbols = useMemo(() => [...state.calls.map((c) => c.symbol), BENCHMARK], [state.calls]);
  const histories = useHistories(market ? symbols : []);
  const results = useMemo(
    () =>
      [...state.calls]
        .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))
        .map((c) => evaluateCall(c, histories[c.symbol], histories[BENCHMARK], !!market?.t[c.symbol])),
    [state.calls, histories, market],
  );
  const score = useMemo(() => scorecard(results), [results]);
  const loading = results.some((r) => r.status === "loading") || (!market && state.calls.length > 0);
  return { results, score, histories, loading };
}

/** Tickers Marc follows, tagged by why: on the watchlist, or a Cramer call he logged. */
export function useTags(): Map<string, Set<Tag>> {
  const { state } = useStore();
  return useMemo(() => {
    const m = new Map<string, Set<Tag>>();
    const add = (s: string, t: Tag) => m.set(s, (m.get(s) ?? new Set<Tag>()).add(t));
    for (const w of state.watchlist) add(w.symbol, "Watching");
    for (const c of state.calls) add(c.symbol, "Cramer call");
    return m;
  }, [state.watchlist, state.calls]);
}
