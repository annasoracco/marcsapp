import { useEffect, useState } from "react";
import type { Dataset, MoreShard, RawDataset } from "./data";
import { decodeDataset, withMore } from "./data";

export const DATA_URL = `${import.meta.env.BASE_URL}data/hindsight.json`;
export const MORE_URL = `${import.meta.env.BASE_URL}data/hindsight-more.json`;

export interface DataState {
  ds: Dataset | null;
  /** True once the second shard (the rest of the universe) has arrived or failed. */
  complete: boolean;
  error: boolean;
}

/**
 * Loads both data shards at startup, in parallel, regardless of anything Marc types or picks,
 * so the network never learns which stock or date he's looking at.
 */
export function useDataset(): DataState {
  const [state, setState] = useState<DataState>({ ds: null, complete: false, error: false });
  useEffect(() => {
    let alive = true;
    const core = fetch(DATA_URL).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<RawDataset>;
    }).then((raw) => {
      if (raw?.v !== 4) throw new Error("Unknown data format");
      return raw;
    });
    const more = fetch(MORE_URL).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<MoreShard>;
    });
    // Handled below once the first shard is in; this keeps an early failure from going unhandled.
    more.catch(() => {});
    core
      .then((raw) => {
        if (!alive) return;
        const ds = decodeDataset(raw);
        setState({ ds, complete: false, error: false });
        // The two shards must come from the same data run. If a cache hands back a mismatched second
        // shard, ask once more past the HTTP cache; if it still doesn't match, use the first shard alone.
        const same = (m: MoreShard) => m?.v === raw.v && m.generatedAt === raw.generatedAt;
        more
          .then((m) => (same(m) ? m : fetch(MORE_URL, { cache: "reload" }).then((r) => r.json() as Promise<MoreShard>)))
          .then((m) => {
            if (!alive) return;
            setState({ ds: same(m) ? withMore(ds, raw.moments, m.t ?? []) : ds, complete: true, error: false });
          })
          .catch(() => alive && setState({ ds, complete: true, error: false }));
      })
      .catch(() => alive && setState({ ds: null, complete: true, error: true }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
