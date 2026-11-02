import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, ScanEye, Star } from "lucide-react";
import { useStore } from "../lib/store";
import { useHistories, useMarket } from "../lib/market";
import { useCallResults } from "../lib/useCalls";
import { normalizeSymbol, returnSince, sliceFrom, trailingReturn, ytdReturn } from "../lib/history";
import { addDays, etDateFromEpoch, todayET } from "../lib/dates";
import { earningsTiming, indexWeights, p1, signed1, whenLabel } from "../lib/insights";
import { isFund } from "../lib/funds";
import { indexLevel, perSharePrice, shortDate, stamp } from "../lib/format";
import { shortName } from "../lib/names";
import { navigate } from "../lib/route";
import { useUi } from "../components/Sheet";
import { Delta, Monogram, Pill, SectionHead, Skeleton } from "../components/bits";
import { ChangeChart } from "../components/charts";

const KIND_LABEL = { s: "Stock", e: "ETF", f: "Mutual fund", m: "Money market fund", i: "Index" } as const;
const RANGES = [
  ["1M", 31],
  ["6M", 183],
  ["1Y", 365],
  ["2Y", 731],
] as const;

export function Ticker({ symbol: raw }: { symbol: string }) {
  const symbol = normalizeSymbol(raw);
  const { state, dispatch } = useStore();
  const { open } = useUi();
  const ms = useMarket();
  const { results } = useCallResults();
  const [range, setRange] = useState<(typeof RANGES)[number][0]>("1Y");
  const h = useHistories(ms.status === "ready" ? [symbol, "SPY"] : []);
  const back = () => (window.history.length > 1 ? window.history.back() : navigate("/markets"));
  const myCalls = useMemo(() => results.filter((r) => r.call.symbol === symbol), [results, symbol]);

  const header = (
    <button type="button" className="back-btn" onClick={back}>
      <ChevronLeft size={20} aria-hidden="true" /> Back
    </button>
  );
  if (ms.status !== "ready") {
    return (
      <div className="view ticker" aria-busy="true">
        {header}
        <Skeleton w="50%" h={34} />
        <Skeleton h={168} r={8} />
      </div>
    );
  }
  const { market } = ms.data;
  const t = market.t[symbol];
  if (!t) {
    return (
      <div className="view ticker">
        {header}
        <h1 className="large-title" tabIndex={-1}>
          {symbol}
        </h1>
        <p className="lead">{symbol} isn't covered yet. Covered tickers include S&amp;P 500, MidCap 400, and SmallCap 600 stocks, the Nasdaq-100, and popular ETFs and funds.</p>
      </div>
    );
  }
  const watching = state.watchlist.find((w) => w.symbol === symbol);
  const s = h[symbol];
  const sp = h.SPY;
  const days = RANGES.find((r) => r[0] === range)![1];
  const start = s ? addDays(s.dates[s.dates.length - 1], -days) : "";
  const today = todayET();
  const weight = indexWeights(market).get(symbol);
  const earnDate = t.e ? etDateFromEpoch(t.e) : null;
  const sinceWatch = watching && s ? returnSince(s, watching.addedOn) : null;
  const spSinceWatch = watching && sp ? returnSince(sp, watching.addedOn) : null;
  const isIndex = t.k === "i";

  return (
    <div className="view ticker">
      {header}
      <div className="ticker-head">
        <Monogram symbol={symbol} size={48} />
        <div className="row-main">
          <h1 className="large-title tight" tabIndex={-1}>
            {symbol}
          </h1>
          <p className="row-sub">
            {t.n} · {KIND_LABEL[t.k]}
            {t.sec ? ` · ${t.sec}` : ""}
          </p>
        </div>
      </div>

      <div className="ticker-figure">
        <Delta value={t.c} digits={2} className="hero-delta" label={`${symbol} today`} />
        <span className="hero-caption">
          {isIndex ? `${indexLevel(t.p)} points` : `${perSharePrice(t.p)} a share`} · {t.t ? stamp(new Date(t.t * 1000)) : "today"}
        </span>
      </div>

      {!isIndex && (
        <div className="btn-row">
          <button
            type="button"
            className={`btn ${watching ? "quiet on" : "primary"}`}
            aria-pressed={!!watching}
            onClick={() => dispatch({ type: watching ? "removeWatch" : "addWatch", symbol })}
          >
            <Star size={18} aria-hidden="true" fill={watching ? "currentColor" : "none"} /> {watching ? "Watching" : "Watch"}
          </button>
          {t.k === "s" ? (
            <button type="button" className="btn quiet" onClick={() => open({ kind: "addCall", symbol })}>
              <Plus size={18} aria-hidden="true" /> Log a Cramer call
            </button>
          ) : isFund(market, symbol) ? (
            <a className="btn quiet" href={`#/funds/${symbol}`}>
              <ScanEye size={18} aria-hidden="true" /> Fund X-ray
            </a>
          ) : null}
        </div>
      )}

      <section aria-labelledby="chart-h">
        <SectionHead id="chart-h" title="Vs the S&P 500" />
        <div className="seg-tabs" role="group" aria-label="Chart range">
          {RANGES.map(([r]) => (
            <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>
              {r}
            </button>
          ))}
        </div>
        {s === undefined || sp === undefined ? (
          <Skeleton h={168} r={8} />
        ) : s ? (
          <ChangeChart
            label={`${symbol} vs the S&P 500 over ${range}`}
            lines={[
              { label: symbol, series: sliceFrom(s, start), tone: "main" },
              ...(sp && symbol !== "SPY" ? [{ label: "S&P 500", series: sliceFrom(sp, start), tone: "ref" as const }] : []),
            ]}
          />
        ) : (
          <p className="quiet-note">No price history yet.</p>
        )}
        {s && (
          <dl className="stat-row five">
            {[
              ["1 week", trailingReturn(s, 7)],
              ["1 month", trailingReturn(s, 30)],
              ["This year", ytdReturn(s)],
              ["1 year", trailingReturn(s, 365)],
              ["2 years", trailingReturn(s, 730)],
            ].map(([l, v]) => (
              <div key={l as string}>
                <dt>{l as string}</dt>
                <dd>
                  <Delta value={v as number | null} />
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {(weight || earnDate || watching) && (
        <section aria-labelledby="know-h">
          <SectionHead id="know-h" title="Good to know" />
          <ul className="facts">
            {earnDate && earnDate >= today && (
              <li>
                Reports earnings {whenLabel(earnDate, today)}
                {whenLabel(earnDate, today) === shortDate(earnDate) ? "" : ` (${shortDate(earnDate)})`}
                {t.e ? `, ${earningsTiming(t.e, t.ec).toLowerCase()}` : ""}
                {t.est ? ", date not confirmed yet" : ""}.
              </li>
            )}
            {weight !== undefined && weight > 0 && <li>{shortName(t.n)} is about {p1(weight)} of the S&amp;P 500 by size.</li>}
            {watching && sinceWatch !== null && (
              <li>
                Since you started watching on {shortDate(watching.addedOn)}: {signed1(sinceWatch)}
                {spSinceWatch !== null ? `, vs ${signed1(spSinceWatch)} for the S&P 500` : ""}.
              </li>
            )}
          </ul>
        </section>
      )}

      {myCalls.length > 0 && (
        <section aria-labelledby="tcalls-h">
          <SectionHead id="tcalls-h" title="Cramer calls you logged" />
          <ul className="rows">
            {myCalls.map((r) => (
              <li key={r.call.id}>
                <button type="button" className="row pressable" onClick={() => open({ kind: "call", id: r.call.id })}>
                  <Pill action={r.call.action} />
                  <span className="row-main">
                    <span className="row-title">{shortDate(r.call.date)}</span>
                  </span>
                  <span className="row-end">{r.status === "ok" ? <span className={`num ${(r.excess ?? 0) >= 0 ? "pos" : "neg"}`}>{signed1(r.excess)} vs market</span> : <span className="row-sub">Pending</span>}</span>
                  <ChevronRight className="row-chev" size={18} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="disclaimer">Not financial advice. Prices may be delayed.</p>
    </div>
  );
}
