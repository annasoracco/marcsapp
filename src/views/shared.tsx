import { ExternalLink, Plus } from "lucide-react";
import type { Suggestion } from "../lib/news";
import { shortDate } from "../lib/format";
import { tickerHref } from "../lib/route";
import { useUi } from "../components/Sheet";
import { Delta, Monogram } from "../components/bits";

export function isStandalone(): boolean {
  return (
    (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** All 11 sectors in one sorted diverging list. Compact by default; tappable rows with `links`. */
export function SectorList({ sectors, links }: { sectors: { symbol: string; label: string; change: number }[]; links?: boolean }) {
  const max = Math.max(...sectors.map((q) => Math.abs(q.change)), 0.001);
  return (
    <ul className={`sector-list ${links ? "links" : ""}`} aria-label="Sector moves, best to worst">
      {[...sectors]
        .sort((a, b) => b.change - a.change)
        .map((s) => {
          const w = `${(Math.abs(s.change) / max) * 50}%`;
          const pos = s.change >= 0;
          const body = (
            <>
              <span className="sl-label">{s.label}</span>
              <span className="sl-track" aria-hidden="true">
                <span className={`sl-fill ${pos ? "pos" : "neg"}`} style={pos ? { left: "50%", width: w } : { right: "50%", width: w }} />
              </span>
              <Delta value={s.change} className="sl-val" label={s.label} />
            </>
          );
          return (
            <li key={s.symbol}>
              {links ? (
                <a className="sector-line pressable" href={tickerHref(s.symbol)}>
                  {body}
                </a>
              ) : (
                <span className="sector-line">{body}</span>
              )}
            </li>
          );
        })}
    </ul>
  );
}

/** "From the show": headlines that name a covered company, with a one-tap Track action. */
export function HeadlineSuggestions({ suggestions }: { suggestions: Suggestion[] }) {
  const { open } = useUi();
  return (
    <div className="suggest">
      <h3 className="sub-head">Heard on the show? Track it</h3>
      <ul className="rows">
        {suggestions.map((s) => (
          <li key={s.symbol + s.link} className="suggest-row">
            <Monogram symbol={s.symbol} size={36} />
            <span className="row-main">
              <a className="suggest-link" href={s.link} target="_blank" rel="noopener noreferrer">
                {s.title}
                <ExternalLink size={13} aria-label="opens CNBC.com" className="ext" />
              </a>
              <span className="row-sub">CNBC · {shortDate(s.date)}</span>
            </span>
            <button
              type="button"
              className="btn small quiet"
              onClick={() => open({ kind: "addCall", symbol: s.symbol, date: s.date, segment: s.segment, link: s.link })}
              aria-label={`Track a call on ${s.symbol}`}
            >
              <Plus size={16} aria-hidden="true" /> {s.symbol}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const EXPLAIN: Record<string, { title: string; body: string[] }> = {
  follow: {
    title: "Follow Cramer",
    body: [
      "Buy every stock he says to buy and bet against every stock he says to sell, starting at the close on the day the show aired.",
      "The number is the average return per call, so one big winner or loser counts the same as any other call.",
    ],
  },
  inverse: {
    title: "Do the opposite",
    body: [
      "Bet against his Buys and buy his Sells. People call this the Inverse Cramer.",
      "It always mirrors Follow Cramer: when one is up 3% per call, the other is down 3%.",
    ],
  },
  market: {
    title: "Just buy the S&P",
    body: [
      "Instead of acting on a call, put the same money in an S&P 500 fund (SPY) on the same day and hold it just as long.",
      "This is the bar every call has to clear.",
    ],
  },
  right: {
    title: "Right or wrong",
    body: [
      "A Buy is right when the stock beat the S&P 500 since the call. A Sell is right when the stock trailed it.",
      "Holds aren't scored. Calls are measured from the close on the day they aired, with dividends included.",
    ],
  },
  vsMarket: {
    title: "Versus the market",
    body: [
      "How much better or worse the stock did than the S&P 500 over the same days.",
      "+7.6% vs market means the stock gained 7.6 percentage points more than the S&P 500.",
    ],
  },
};
