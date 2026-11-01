import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { useHistories, useMarket } from "../lib/market";
import { normalizeSymbol, sliceFrom, trailingReturn, ytdReturn } from "../lib/history";
import { addDays } from "../lib/dates";
import { buildXray } from "../lib/xray";
import { ACTION_LABEL, BENCHMARK, evaluateCall } from "../lib/calls";
import { etDateFromEpoch } from "../lib/dates";
import { dayLabel, longDate, perSharePrice, stamp, weight } from "../lib/format";
import { tickerHref } from "../lib/route";
import { Card, Change, Empty } from "../components/ui";
import { LineChart } from "../components/LineChart";
import type { Series } from "../lib/marketTypes";

const KIND_LABEL = { s: "Stock", e: "ETF", f: "Mutual fund", m: "Money market", i: "Index" } as const;
const RANGES = [
  ["1M", 31],
  ["6M", 183],
  ["1Y", 365],
  ["2Y", 731],
] as const;

export function TickerView({ symbol: raw }: { symbol: string }) {
  const symbol = normalizeSymbol(raw);
  const { state, dispatch } = useStore();
  const ms = useMarket();
  const data = ms.status === "ready" ? ms.data : undefined;
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("1Y");
  const h = useHistories(data ? [symbol, BENCHMARK] : []);
  const x = useMemo(() => (data ? buildXray(state.accounts, data.market, data.funds, state.settings.concentrationPct) : null), [data, state.accounts, state.settings.concentrationPct]);
  if (!data || !x) return <p className="muted">Loading market data…</p>;
  const q = data.market.t[symbol];
  const series = h[symbol];
  const onWatch = state.watchlist.some((w) => w.symbol === symbol);
  const calls = state.calls.filter((c) => c.symbol === symbol);
  const pos = x.positions.find((p) => p.symbol === symbol);
  const exp = x.exposures.find((e) => e.symbol === symbol);
  const fund = data.funds.f[symbol];

  if (!q) {
    return (
      <>
        <div className="page-head">
          <h1 tabIndex={-1}>{symbol}</h1>
        </div>
        <Card>
          <p>{symbol} isn’t covered yet. To add it, put it in config/extra-tickers.json in the repo; the next data run picks it up.</p>
        </Card>
      </>
    );
  }

  const days = RANGES.find((r) => r[0] === range)![1];
  const chartSeries: Series | null | undefined = series ? sliceFrom(series, addDays(series.dates[series.dates.length - 1], -days)) : series;

  return (
    <>
      <div className="page-head">
        <h1 tabIndex={-1}>
          {symbol} <span className="h1-name">{q.n}</span>
        </h1>
      </div>
      <Card className="hero">
        <span className="stat-label">
          {KIND_LABEL[q.k]}
          {q.sec ? ` · ${q.sec}` : ""}
        </span>
        <span className="hero-value">
          <Change value={q.c} digits={2} label={`${symbol} today`} />
        </span>
        <span className="stat-sub">
          {q.k === "i" ? "" : `${perSharePrice(q.p)} per share · `}
          {q.t ? stamp(new Date(q.t * 1000)) : ""}
        </span>
        <div className="form-actions">
          <a className="btn primary small" href={`#/calls/new/${encodeURIComponent(symbol)}`}>
            Log a Cramer call
          </a>
          <button type="button" className="btn ghost small" onClick={() => dispatch({ type: onWatch ? "removeWatch" : "addWatch", symbol })}>
            {onWatch ? "Remove from watchlist" : "Add to watchlist"}
          </button>
        </div>
      </Card>

      <Card id="perf" title="Performance">
        {series ? (
          <dl className="vs perf">
            {[
              ["1 week", trailingReturn(series, 7)],
              ["1 month", trailingReturn(series, 30)],
              ["YTD", ytdReturn(series)],
              ["1 year", trailingReturn(series, 365)],
              ["2 years", trailingReturn(series, 730)],
            ].map(([l, v]) => (
              <div key={l as string}>
                <dt>{l as string}</dt>
                <dd>
                  <Change value={v as number | null} />
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <Empty>{series === undefined ? "Loading history…" : "No price history yet."}</Empty>
        )}
        <div className="seg small" role="group" aria-label="Chart range">
          {RANGES.map(([r]) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>
              {r}
            </button>
          ))}
        </div>
        {chartSeries && <LineChart series={chartSeries} label={`${symbol} over ${range}, percent change`} />}
      </Card>

      {q.e && (
        <Card id="earn" title="Next earnings">
          <p>
            {dayLabel(etDateFromEpoch(q.e))}
            {q.est ? " (estimated)" : ""}
          </p>
        </Card>
      )}

      {(pos || exp) && (
        <Card id="yours" title="In your portfolio">
          <ul className="plain">
            {pos && (
              <li>
                {weight(pos.weight)} directly, across {pos.accounts.map((a) => `${a.name} (${weight(a.weight)})`).join(", ")}
              </li>
            )}
            {exp && exp.via.length > 0 && (
              <li>
                {weight(exp.total - exp.direct)} more through {exp.via.map((v) => `${v.fund} (${weight(v.weight)})`).join(", ")}
              </li>
            )}
          </ul>
        </Card>
      )}

      {calls.length > 0 && (
        <Card id="tcalls" title="Cramer calls on this one">
          <ul className="rows">
            {calls.map((c) => {
              const r = evaluateCall(c, h[symbol], h[BENCHMARK], true);
              return (
                <li key={c.id} className="row-link">
                  <span className={`badge ${c.action}`}>{ACTION_LABEL[c.action]}</span>
                  <span className="small">{longDate(c.date)}</span>
                  {r.status === "ok" ? <Change value={r.excess} label="vs S&P 500" /> : <span className="muted small">pending</span>}
                </li>
              );
            })}
          </ul>
          <p className="fine">Shown as return minus the S&amp;P 500 since each call.</p>
        </Card>
      )}

      {fund && (fund.h.length > 0 || Object.keys(fund.sec).length > 0) && (
        <Card id="inside" title="What’s inside">
          {fund.h.length > 0 && (
            <ul className="rows">
              {fund.h.map(([s, w, n]) => (
                <li key={s + n}>
                  <a className="row-link" href={data.market.t[s] ? tickerHref(s) : undefined}>
                    <span className="sym">{s || "\u2014"}</span>
                    <span className="muted small name-inline">{n}</span>
                    <span>{weight(w)}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="fine">
            Stocks {weight(fund.st)} · Bonds {weight(fund.bd)} · Cash {weight(fund.ca)}
          </p>
        </Card>
      )}
    </>
  );
}
