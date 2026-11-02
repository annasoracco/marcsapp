import { useMemo, useState } from "react";
import { ChevronRight, Plus, X } from "lucide-react";
import { useStore } from "../lib/store";
import { useHistories, useMarket } from "../lib/market";
import { useTags } from "../lib/useCalls";
import { INDEX_NAMES, SECTOR_ETFS, SECTOR_SHORT, signed1, upcomingEarnings, type Tag } from "../lib/insights";
import { trailingReturn, ytdReturn } from "../lib/history";
import { daysBetween, todayET } from "../lib/dates";
import { dayLabel, indexLevel } from "../lib/format";
import { shortName } from "../lib/names";
import { navigate, tickerHref } from "../lib/route";
import type { Series } from "../lib/marketTypes";
import { TickerSearch } from "../components/TickerSearch";
import { Delta, Monogram, SectionHead, Skeleton } from "../components/bits";
import { SectorList } from "./shared";

type Period = "1D" | "1M" | "YTD" | "1Y";
type EarnFilter = "big" | "mine" | "all";

function periodReturn(p: Period, s: Series | null | undefined, today: number | undefined): number | null {
  if (p === "1D") return today ?? null;
  if (!s) return null;
  if (p === "1M") return trailingReturn(s, 30);
  if (p === "YTD") return ytdReturn(s);
  return trailingReturn(s, 365);
}

export function Markets() {
  const { state, dispatch } = useStore();
  const ms = useMarket();
  const tags = useTags();
  const [q, setQ] = useState("");
  const [period, setPeriod] = useState<Period>("1D");
  const [adding, setAdding] = useState(false);
  const [addQ, setAddQ] = useState("");
  const [earn, setEarn] = useState<EarnFilter>("big");
  const watch = useMemo(() => state.watchlist.map((w) => w.symbol), [state.watchlist]);
  const h = useHistories(ms.status === "ready" ? [...watch, "SPY"] : []);

  if (ms.status !== "ready") {
    return (
      <div className="view markets" aria-busy="true">
        <h1 className="large-title">Markets</h1>
        <Skeleton h={44} />
        <Skeleton h={120} r={8} />
      </div>
    );
  }
  const { market } = ms.data;
  const today = todayET();
  const spPeriod = periodReturn(period, h.SPY, market.t.SPY?.c);
  const sectors = Object.entries(SECTOR_ETFS)
    .filter(([s]) => market.t[s])
    .map(([symbol, sector]) => ({ symbol, label: SECTOR_SHORT[sector], change: market.t[symbol].c }));
  const all = upcomingEarnings(market, tags as Map<string, Set<Tag>>, today, 14);
  const shown = all.filter((e) => (earn === "all" ? true : earn === "mine" ? e.tags.length > 0 : e.tags.length > 0 || e.mc >= 50));
  const byDay = new Map<string, typeof shown>();
  for (const e of shown) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);

  return (
    <div className="view markets">
      <h1 className="large-title" tabIndex={-1}>
        Markets
      </h1>
      <TickerSearch
        label="Search stocks and funds"
        hideLabel
        value={q}
        onChange={setQ}
        onPick={(o) => {
          setQ("");
          navigate(`/t/${encodeURIComponent(o.symbol)}`);
        }}
        market={market}
        placeholder="Search any stock or fund"
      />

      <section aria-labelledby="idx-h">
        <SectionHead id="idx-h" title="Indices" />
        <ul className="index-grid">
          {(["^GSPC", "^IXIC", "^DJI", "^RUT"] as const)
            .filter((s) => market.t[s])
            .map((s) => (
              <li key={s}>
                <a className="index-cell pressable" href={tickerHref(s)}>
                  <span className="index-name">{INDEX_NAMES[s]}</span>
                  <Delta value={market.t[s].c} digits={2} label={INDEX_NAMES[s]} className="big" />
                  <span className="row-sub num">{indexLevel(market.t[s].p)}</span>
                </a>
              </li>
            ))}
        </ul>
        {market.t["^VIX"] && (
          <p className="fine">
            The VIX, Wall Street's fear gauge, is at {indexLevel(market.t["^VIX"].p)} ({signed1(market.t["^VIX"].c)} today).
          </p>
        )}
      </section>

      <section aria-labelledby="watch-h">
        <SectionHead
          id="watch-h"
          title="Stocks you're watching"
          action={
            <button type="button" className="link-btn" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
              {adding ? <X size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />} {adding ? "Done" : "Add"}
            </button>
          }
        />
        {adding && (
          <TickerSearch
            label="Add a ticker to watch"
            value={addQ}
            onChange={setAddQ}
            onPick={(o) => {
              dispatch({ type: "addWatch", symbol: o.symbol });
              setAddQ("");
            }}
            market={market}
            placeholder="Ticker or company"
            inline
            autoFocus
            limit={5}
          />
        )}
        {state.watchlist.length === 0 ? (
          <p className="quiet-note">Watch any stock to follow it here. Search above, open it, and tap Watch.</p>
        ) : (
          <>
            <div className="chips" role="group" aria-label="Return period">
              {(["1D", "1M", "YTD", "1Y"] as Period[]).map((p) => (
                <button key={p} type="button" className="chip" aria-pressed={period === p} onClick={() => setPeriod(p)}>
                  {p === "1D" ? "Today" : p}
                </button>
              ))}
            </div>
            <ul className="rows">
              {state.watchlist.map((w) => {
                const t = market.t[w.symbol];
                const r = periodReturn(period, h[w.symbol], t?.c);
                const ex = r !== null && spPeriod !== null ? r - spPeriod : null;
                return (
                  <li key={w.symbol}>
                    <a className="row pressable" href={tickerHref(w.symbol)}>
                      <Monogram symbol={w.symbol} />
                      <span className="row-main">
                        <span className="row-title">
                          {w.symbol}
                        </span>
                        <span className="row-sub">{t ? shortName(t.n) : "Not covered yet"}</span>
                      </span>
                      <span className="row-end">
                        {r === null && h[w.symbol] === undefined && period !== "1D" ? <Skeleton w={56} h={14} /> : <Delta value={r} label={w.symbol} />}
                        {ex !== null && <span className="row-sub num">{signed1(ex)} vs S&amp;P</span>}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <section aria-labelledby="msec-h">
        <SectionHead id="msec-h" title="Sectors today" />
        <SectorList sectors={sectors} links />
      </section>

      <section aria-labelledby="earnings" id="earnings-section">
        <SectionHead id="earnings" title="Earnings calendar" />
        <div className="chips wrap" role="group" aria-label="Which companies">
          {(
            [
              ["big", "Big companies"],
              ["mine", "Watching and Cramer"],
              ["all", "Everything"],
            ] as [EarnFilter, string][]
          ).map(([k, l]) => (
            <button key={k} type="button" className="chip" aria-pressed={earn === k} onClick={() => setEarn(k)}>
              {l}
            </button>
          ))}
        </div>
        {byDay.size === 0 ? (
          <p className="quiet-note">Nothing scheduled in the next two weeks for this filter.</p>
        ) : (
          [...byDay.entries()].map(([date, list]) => {
            const n = daysBetween(today, date);
            return (
              <div key={date} className="day-group">
                <h3 className="day-head">
                  {n === 0 ? "Today" : n === 1 ? "Tomorrow" : dayLabel(date)}
                  <span className="muted"> · {list.length}</span>
                </h3>
                <ul className="rows">
                  {list.slice(0, earn === "all" ? 40 : 12).map((e) => (
                    <li key={e.symbol}>
                      <a className="row pressable" href={tickerHref(e.symbol)}>
                        <Monogram symbol={e.symbol} size={32} />
                        <span className="row-main">
                          <span className="row-title">
                            {e.symbol}
                            {e.tags.map((t) => (
                              <span key={t} className="tag">
                                {t}
                              </span>
                            ))}
                          </span>
                          <span className="row-sub">{e.name}</span>
                        </span>
                        <span className="row-end row-sub">
                          {e.timing}
                          {e.estimate ? " (est.)" : ""}
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
        <p className="fine">Dates from Yahoo Finance; companies sometimes move them. Next 14 days.</p>
      </section>

      <a className="link-btn" href="#/funds">
        Look inside a fund with Fund X-ray <ChevronRight size={16} aria-hidden="true" />
      </a>
      <p className="disclaimer">Not financial advice. Prices may be delayed.</p>
    </div>
  );
}
