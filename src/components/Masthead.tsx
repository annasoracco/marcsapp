import { useMarket } from "../lib/market";
import type { Page } from "../lib/route";
import { dayShort, etDateFromEpoch, todayET } from "../lib/dates";
import { Pct } from "./bits";

const INDICES: [string, string][] = [
  ["^GSPC", "S&P 500"],
  ["^IXIC", "Nasdaq"],
  ["^DJI", "Dow"],
];

const timeFmt = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });

function MarketLine({ now }: { now: Date }) {
  const market = useMarket();
  if (market.status !== "ready") return <p className="tape tape-empty">&nbsp;</p>;
  if (market.data.meta.source === "sample") return <p className="tape">Live prices are unavailable right now.</p>;
  const t = market.data.market.t;
  const ref = t.SPY ?? t["^GSPC"];
  let when = "";
  if (ref?.t) {
    const d = etDateFromEpoch(ref.t);
    if (ref.ms === "REGULAR") when = `${timeFmt.format(new Date(market.data.meta.quotesAsOf))} ET`;
    else when = d === todayET(now) ? "Today's close" : `${dayShort(d)} close`;
  }
  const items = INDICES.filter(([s]) => t[s]);
  if (!items.length) return null;
  return (
    <p className="tape" aria-label="Market today">
      {items.map(([s, label]) => (
        <span key={s} className="tape-item">
          {label} <Pct value={t[s].c} />
        </span>
      ))}
      {when && <span className="tape-when">{when}</span>}
    </p>
  );
}

export function Masthead({ page, now }: { page: Page; now: Date }) {
  const Title = page === "home" ? "h1" : "p";
  return (
    <header className="masthead">
      <div className="mast-row">
        <Title className="wordmark">
          <a href="#/">
            Marc <span className="vs">vs.</span> Cramer
          </a>
        </Title>
        <nav className="nav" aria-label="Pages">
          {page === "home" ? (
            <a href="#/season">
              Season
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="m4.5 3 3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          ) : (
            <a href="#/">
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="m7.5 3-3 3 3 3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Board
            </a>
          )}
        </nav>
      </div>
      <MarketLine now={now} />
    </header>
  );
}
