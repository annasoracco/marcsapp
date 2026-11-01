import { useMemo } from "react";
import { useStore } from "./store";
import { useMarket } from "./market";
import { composeAccount } from "./xray";
import type { Tag } from "./today";

/** Every symbol Marc cares about, tagged by why: holding, watchlist, or Cramer call. */
export function useTags(): Map<string, Set<Tag>> {
  const { state } = useStore();
  const ms = useMarket();
  const market = ms.status === "ready" ? ms.data.market : undefined;
  return useMemo(() => {
    const m = new Map<string, Set<Tag>>();
    const add = (s: string | undefined, t: Tag) => {
      if (!s) return;
      const set = m.get(s) ?? new Set<Tag>();
      set.add(t);
      m.set(s, set);
    };
    if (market) for (const a of state.accounts) for (const p of composeAccount(a, market).positions) add(p.symbol, "Holding");
    for (const w of state.watchlist) add(w.symbol, "Watchlist");
    for (const c of state.calls) add(c.symbol, "Cramer call");
    return m;
  }, [state.accounts, state.watchlist, state.calls, market]);
}
