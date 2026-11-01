import { useMemo, useState, type FormEvent } from "react";
import { useStore } from "../lib/store";
import { useHistories, useMarket } from "../lib/market";
import { buildXray } from "../lib/xray";
import { INDEX_NAMES, movers, portfolioChange, SECTOR_ETF_NAMES, type Tag } from "../lib/today";
import { indexLevel, pct, signedPct, shortDate } from "../lib/format";
import { returnSince } from "../lib/history";
import { normalizeSymbol } from "../lib/history";
import { tickerHref } from "../lib/route";
import { Card, Change, Empty } from "../components/ui";
import { TickerInput } from "../components/TickerInput";
import { useTags } from "../lib/useTags";

function heatColor(c: number): string {
  const m = Math.min(1, Math.abs(c) / 0.025);
  if (c >= 0) return `rgb(${Math.round(18 + 12 * m)}, ${Math.round(48 + 74 * m)}, ${Math.round(42 + 18 * m)})`;
  return `rgb(${Math.round(48 + 91 * m)}, ${Math.round(36 + 6 * m)}, ${Math.round(40 + 2 * m)})`;
}

export function TodayView() {
  const { state, dispatch } = useStore();
  const ms = useMarket();
  const data = ms.status === "ready" ? ms.data : undefined;
  const tags = useTags();
  const [watchInput, setWatchInput] = useState("");
  const x = useMemo(() => (data ? buildXray(state.accounts, data.market, data.funds, state.settings.concentrationPct) : null), [data, state.accounts, state.settings.concentrationPct]);
  const histories = useHistories(data ? state.watchlist.map((w) => w.symbol) : []);
  if (!data || !x) return <p className="muted">Loading market data…</p>;
  const { market, meta } = data;
  const port = portfolioChange(x.positions, market);
  const mv = movers(tags as Map<string, Set<Tag>>, market);

  const addWatch = (e: FormEvent) => {
    e.preventDefault();
    const s = normalizeSymbol(watchInput);
    if (!s) return;
    dispatch({ type: "addWatch", symbol: s });
    setWatchInput("");
  };

  return (
    <>
      <div className="page-head">
        <h1 tabIndex={-1}>Today</h1>
      </div>

      {state.accounts.length > 0 && (
        <Card className="hero">
          <span className="stat-label">Your portfolio today</span>
          <span className="hero-value">
            <Change value={port.change} digits={2} label="Your portfolio" />
          </span>
          <span className="stat-sub">
            Weighted across {pct(port.coverage, 0)} of your portfolio with prices. Mutual funds update after the close.
          </span>
        </Card>
      )}

      <Card id="idx" title="Major indices">
        <ul className="idx-grid">
          {meta.indices
            .filter((s) => market.t[s] && s !== "^VIX")
            .map((s) => (
              <li key={s} className="idx">
                <span className="idx-name">{INDEX_NAMES[s] ?? s}</span>
                <Change value={market.t[s].c} digits={2} label={INDEX_NAMES[s] ?? s} />
                <span className="muted small">{indexLevel(market.t[s].p)}</span>
              </li>
            ))}
        </ul>
        {market.t["^VIX"] && (
          <p className="fine">
            VIX (the fear gauge) {indexLevel(market.t["^VIX"].p)}, <Change value={market.t["^VIX"].c} label="VIX" /> today
          </p>
        )}
      </Card>

      <Card id="heat" title="Sector heat map">
        <ul className="heat">
          {meta.sectorEtfs
            .filter((s) => market.t[s])
            .sort((a, b) => market.t[b].c - market.t[a].c)
            .map((s) => (
              <li key={s} style={{ background: heatColor(market.t[s].c) }}>
                <a href={tickerHref(s)}>
                  <span className="heat-name">{SECTOR_ETF_NAMES[s] ?? s}</span>
                  <span className="heat-val">{signedPct(market.t[s].c)}</span>
                  <span className="heat-sym">{s}</span>
                </a>
              </li>
            ))}
        </ul>
        <p className="fine">SPDR sector ETFs, sorted by today’s move.</p>
      </Card>

      <Card id="movers" title="Your biggest movers">
        {mv.up.length === 0 && mv.down.length === 0 ? (
          <Empty>Add holdings, a watchlist, or Cramer calls to see their moves here.</Empty>
        ) : (
          <div className="movers">
            {[
              ["Up", mv.up],
              ["Down", mv.down],
            ].map(([label, list]) => (
              <div key={label as string}>
                <h3>{label as string}</h3>
                <ul className="rows">
                  {(list as typeof mv.up).map((m) => (
                    <li key={m.symbol}>
                      <a href={tickerHref(m.symbol)} className="row-link">
                        <span className="sym">{m.symbol}</span>
                        <span className="muted small row-tags">{m.tags.join(" · ")}</span>
                        <Change value={m.change} label={m.symbol} />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card id="watch" title="Watchlist">
        <form className="inline-form" onSubmit={addWatch}>
          <TickerInput label="Add a ticker" value={watchInput} onChange={setWatchInput} market={market} placeholder="e.g. TSLA" />
          <button type="submit" className="btn primary">
            Add
          </button>
        </form>
        {state.watchlist.length === 0 ? (
          <Empty>Nothing on your watchlist yet.</Empty>
        ) : (
          <ul className="rows">
            {state.watchlist.map((w) => {
              const q = market.t[w.symbol];
              const h = histories[w.symbol];
              const since = h ? returnSince(h, w.addedOn) : null;
              return (
                <li key={w.symbol} className="watch-row">
                  <a href={tickerHref(w.symbol)} className="row-link">
                    <span className="sym">{w.symbol}</span>
                    {w.sample && <span className="tag">Sample</span>}
                    {q ? <Change value={q.c} label={`${w.symbol} today`} /> : <span className="muted small">not covered yet</span>}
                  </a>
                  <span className="muted small">
                    Since {shortDate(w.addedOn)}: {since === null ? "\u2014" : signedPct(since)}
                  </span>
                  <button type="button" className="btn ghost small" onClick={() => dispatch({ type: "removeWatch", symbol: w.symbol })} aria-label={`Remove ${w.symbol} from watchlist`}>
                    Remove
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
