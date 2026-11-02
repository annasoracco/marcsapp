import { useMemo, useState } from "react";
import type { MarketFile } from "../lib/marketTypes";
import { normalizeSymbol } from "../lib/history";
import { shortName } from "../lib/slate";

interface Match {
  s: string;
  n: string;
}

export function searchTickers(q: string, market: MarketFile | undefined, exclude: Set<string>, limit = 6): Match[] {
  const query = q.trim();
  if (!query || !market) return [];
  const sym = normalizeSymbol(query);
  const lower = query.toLowerCase();
  const scored: [number, Match][] = [];
  for (const [s, info] of Object.entries(market.t)) {
    if (info.k === "i" || exclude.has(s)) continue;
    const n = shortName(info.n, s);
    let score = -1;
    if (s === sym) score = 0;
    else if (s.startsWith(sym)) score = 1 + s.length / 100;
    else if (n.toLowerCase().startsWith(lower)) score = 2;
    else if (lower.length >= 3 && n.toLowerCase().includes(lower)) score = 3;
    if (score >= 0) scored.push([score, { s, n }]);
  }
  return scored
    .sort((a, b) => a[0] - b[0] || a[1].s.localeCompare(b[1].s))
    .slice(0, limit)
    .map(([, m]) => m);
}

export function OwnedStocks({
  owned,
  market,
  onToggle,
}: {
  owned: string[];
  market: MarketFile | undefined;
  onToggle: (s: string, on: boolean) => void;
}) {
  const [q, setQ] = useState("");
  const ownedSet = useMemo(() => new Set(owned), [owned]);
  const matches = useMemo(() => searchTickers(q, market, ownedSet), [q, market, ownedSet]);
  const sym = normalizeSymbol(q);
  const canAddRaw = /^[A-Z][A-Z0-9-]{0,9}$/.test(sym) && !ownedSet.has(sym) && !matches.some((m) => m.s === sym);
  const add = (s: string) => {
    onToggle(s, true);
    setQ("");
  };

  return (
    <section className="block" aria-labelledby="own-h">
      <div className="block-head">
        <h2 id="own-h">Stocks you own</h2>
      </div>
      <p className="block-sub">
        Tickers only, saved on this phone. When Cramer talks about one, it moves to the top of the board.
      </p>
      {owned.length > 0 && (
        <ul className="owned" aria-label="Your stocks">
          {owned.map((s) => (
            <li key={s}>
              <span className="tk">{s}</span>
              <button type="button" className="owned-x" aria-label={`Remove ${s}`} onClick={() => onToggle(s, false)}>
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <path d="m3.5 3.5 5 5m0-5-5 5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="add"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (matches[0]) add(matches[0].s);
          else if (canAddRaw) add(sym);
        }}
      >
        <label htmlFor="add-tk" className="sr-only">
          Add a stock you own
        </label>
        <input
          id="add-tk"
          type="text"
          inputMode="search"
          placeholder="Add a ticker or company"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="done"
        />
        {q.trim() && (
          <ul className="suggest">
            {matches.map((m) => (
              <li key={m.s}>
                <button type="button" onClick={() => add(m.s)}>
                  <span className="tk">{m.s}</span>
                  <span className="suggest-name">{m.n}</span>
                </button>
              </li>
            ))}
            {canAddRaw && (
              <li>
                <button type="button" onClick={() => add(sym)}>
                  <span className="tk">{sym}</span>
                  <span className="suggest-name">Add it anyway</span>
                </button>
              </li>
            )}
            {!matches.length && !canAddRaw && <li className="suggest-none">No match</li>}
          </ul>
        )}
      </form>
    </section>
  );
}
