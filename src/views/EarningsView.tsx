import { useMemo, useState } from "react";
import { useMarket } from "../lib/market";
import { upcomingEarnings, type Tag } from "../lib/today";
import { useTags } from "../lib/useTags";
import { addDays, daysBetween, todayET } from "../lib/dates";
import { dayLabel } from "../lib/format";
import { tickerHref } from "../lib/route";
import { Card, Empty } from "../components/ui";

type Filter = "All" | Tag;

export function EarningsView() {
  const ms = useMarket();
  const market = ms.status === "ready" ? ms.data.market : undefined;
  const tags = useTags();
  const [filter, setFilter] = useState<Filter>("All");
  const items = useMemo(() => (market ? upcomingEarnings(tags, market) : []), [tags, market]);
  if (!market) return <p className="muted">Loading market data…</p>;
  const today = todayET();
  const shown = items.filter((i) => filter === "All" || i.tags.includes(filter));
  const groups = new Map<string, typeof shown>();
  for (const i of shown) groups.set(i.date, [...(groups.get(i.date) ?? []), i]);
  const rel = (d: string) => {
    const n = daysBetween(today, d);
    return n === 0 ? "Today" : n === 1 ? "Tomorrow" : d <= addDays(today, 6) ? `In ${n} days` : "";
  };

  return (
    <>
      <div className="page-head">
        <h1 tabIndex={-1}>Earnings radar</h1>
      </div>
      <p className="lede">Upcoming reports for your holdings, watchlist, and Cramer calls (next 90 days).</p>
      <div className="seg small wrap" role="group" aria-label="Filter earnings">
        {(["All", "Holding", "Watchlist", "Cramer call"] as Filter[]).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === "Holding" ? "Holdings" : f === "Cramer call" ? "Cramer calls" : f}
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <Card>
          <Empty>No upcoming earnings found. Add holdings, watchlist names, or calls on individual stocks (funds don’t report earnings).</Empty>
        </Card>
      ) : (
        [...groups.entries()].map(([date, list]) => (
          <Card key={date} title={<>{dayLabel(date)} {rel(date) && <span className="tag">{rel(date)}</span>}</>}>
            <ul className="rows">
              {list.map((i) => (
                <li key={i.symbol}>
                  <a className="row-link earn" href={tickerHref(i.symbol)}>
                    <span className="sym">{i.symbol}</span>
                    <span className="muted small name-inline">{i.name}</span>
                    <span className="small">
                      {i.timing}
                      {i.estimate ? " · est." : ""}
                    </span>
                  </a>
                  <span className="row-tags small muted">{i.tags.join(" · ")}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
      <p className="fine">Dates come from Yahoo Finance and can move. “est.” means the company hasn’t confirmed yet.</p>
    </>
  );
}
