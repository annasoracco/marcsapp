import { useMemo, useState } from "react";
import { ChevronRight, Smartphone, X } from "lucide-react";
import { useStore } from "../lib/store";
import { useHistories, useMarket } from "../lib/market";
import { useCallResults, useTags } from "../lib/useCalls";
import {
  bigReports,
  briefingHeadline,
  cramerCheck,
  indexMovers,
  indexWeights,
  INDEX_NAMES,
  marketMood,
  moversSummary,
  SECTOR_ETFS,
  SECTOR_SHORT,
  upcomingEarnings,
} from "../lib/insights";
import { headlineSuggestions } from "../lib/news";
import { etDateFromEpoch, todayET } from "../lib/dates";
import { returnSince } from "../lib/history";
import { stamp } from "../lib/format";
import { tickerHref } from "../lib/route";
import { useUi } from "../components/Sheet";
import { Delta, Monogram, SectionHead, Skeleton, useCountUp } from "../components/bits";
import { ChangeChart, DivergingBars } from "../components/charts";
import { HeadlineSuggestions, SectorList, isStandalone } from "./shared";

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });
const LONG_DAY = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/New_York" });

export function pts(x: number): string {
  const v = x * 100;
  return `${v >= 0 ? "+" : "\u2212"}${Math.abs(v).toFixed(2)} pts`;
}

export function Briefing() {
  const { state, dispatch } = useStore();
  const { open } = useUi();
  const ms = useMarket();
  const data = ms.status === "ready" ? ms.data : undefined;
  const { results, score } = useCallResults();
  const tags = useTags();
  const [range, setRange] = useState<"5D" | "1M">("1M");
  const watchSymbols = useMemo(() => state.watchlist.map((w) => w.symbol), [state.watchlist]);
  const histories = useHistories(data ? [...watchSymbols, "SPY"] : []);
  const spChange = data ? (data.market.t["^GSPC"]?.c ?? data.market.t.SPY?.c ?? null) : null;
  const counted = useCountUp(spChange);

  if (!data) return <BriefingSkeleton />;
  const { market, news, meta } = data;
  const today = todayET();
  const spy = market.t.SPY;
  const quoteDate = spy?.t ? etDateFromEpoch(spy.t) : today;
  const pastDay = quoteDate < today ? WEEKDAY.format(new Date(`${quoteDate}T12:00:00Z`)) : undefined;
  const sectors = Object.entries(SECTOR_ETFS)
    .filter(([s]) => market.t[s])
    .map(([symbol, sector]) => ({ symbol, sector, label: SECTOR_SHORT[sector], change: market.t[symbol].c }));
  const indices = (["^GSPC", "^IXIC", "^DJI", "^RUT"] as const).filter((s) => market.t[s]).map((s) => ({ symbol: s, name: INDEX_NAMES[s], change: market.t[s].c }));
  const sp = spChange ?? 0;
  const movers = indexMovers(market);
  const headline = briefingHeadline({ mood: marketMood(sp, sectors), sp, movers, pastDay });
  const summary = moversSummary(movers, sp);
  const spLine = histories.SPY ? sliceDays(histories.SPY, range === "5D" ? 7 : 31) : null;

  const watchReturns: Record<string, number | null> = {};
  for (const w of state.watchlist) {
    const h = histories[w.symbol];
    watchReturns[w.symbol] = h ? returnSince(h, w.addedOn) : null;
  }
  const reports = bigReports({ earnings: upcomingEarnings(market, tags, today, 7), weights: indexWeights(market), callResults: results, watchReturns, today });
  const suggestions = headlineSuggestions(news.items, market, state.calls);
  const status = spy?.ms === "REGULAR" ? "Market open" : spy?.ms === "PRE" || spy?.ms === "PREPRE" ? "Before the open" : "Market closed";
  const showMovers = movers.length > 0;

  return (
    <div className="view briefing">
      <h1 className="sr-only" tabIndex={-1}>
        Briefing
      </h1>
      <p className="dateline">
        {LONG_DAY.format(new Date())} · {status}
      </p>

      <section className="hero" aria-label="The market in one line">
        <p className="hero-sentence">{headline}</p>
        <div className="hero-figure">
          <Delta value={counted} digits={2} className="hero-delta" label="S&P 500" />
          <span className="hero-caption">S&amp;P 500{pastDay ? ` on ${pastDay}` : " today"}</span>
        </div>
        <div className="hero-chart">
          <div className="seg-tabs" role="group" aria-label="Chart range">
            {(["5D", "1M"] as const).map((r) => (
              <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>
                {r === "5D" ? "5 days" : "1 month"}
              </button>
            ))}
          </div>
          {spLine ? (
            <ChangeChart height={112} label="S&P 500" lines={[{ label: "S&P 500", series: spLine, tone: "main" }]} />
          ) : (
            <Skeleton h={112} r={8} />
          )}
        </div>
        <ul className="index-strip" aria-label="Major indices">
          {indices.map((i) => (
            <li key={i.symbol}>
              <a className="index-chip pressable" href={tickerHref(i.symbol)}>
                <span className="index-name">{i.symbol === "^RUT" ? "Russell" : i.name}</span>
                <Delta value={i.change} label={i.name} />
              </a>
            </li>
          ))}
        </ul>
        <p className="asof">Prices as of {stamp(meta.quotesAsOf)}</p>
      </section>

      {showMovers && (
        <section aria-labelledby="moved-h">
          <SectionHead id="moved-h" title="What moved the market" />
          {summary && <p className="lead">{summary}</p>}
          <DivergingBars
            label="Biggest contributors to the S&P 500's move, in percentage points"
            rows={movers.slice(0, 6).map((m) => ({
              key: m.symbol,
              label: m.symbol,
              sub: `${m.name} ${m.change >= 0 ? "+" : "\u2212"}${Math.abs(m.change * 100).toFixed(1)}%`,
              value: m.pts,
              text: pts(m.pts),
              href: tickerHref(m.symbol),
            }))}
          />
          <p className="fine">Each bar is the company's weight in the S&amp;P 500 times its move, in percentage points of the index.</p>
        </section>
      )}

      <section aria-labelledby="sec-h">
        <SectionHead id="sec-h" title="Sectors" action={<a className="link-btn" href="#/markets">Markets <ChevronRight size={16} aria-hidden="true" /></a>} />
        <SectorList sectors={sectors} />
      </section>

      <section aria-labelledby="up-h">
        <SectionHead id="up-h" title="Big reports this week" action={<a className="link-btn" href="#/markets/earnings">Calendar <ChevronRight size={16} aria-hidden="true" /></a>} />
        {reports.length === 0 ? (
          <p className="quiet-note">No major earnings in the next 7 days.</p>
        ) : (
          <ul className="rows">
            {reports.map((u) => (
              <li key={u.symbol}>
                <a className="row pressable" href={tickerHref(u.symbol)}>
                  <Monogram symbol={u.symbol} />
                  <span className="row-main">
                    <span className="row-title">{u.title}</span>
                    <span className="row-sub">{u.context}</span>
                  </span>
                  <ChevronRight className="row-chev" size={18} aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="cc-h">
        <SectionHead id="cc-h" title="Cramer check" />
        <a className="row pressable cramer-line" href="#/cramer">
          <span className="row-main">
            <span className="row-title">{cramerCheck(score, state.calls.length)}</span>
            {score.graded > 0 && score.hitRate !== null && (
              <span className="row-sub">{score.hitRate > 0.5 ? "Better than a coin flip so far." : score.hitRate === 0.5 ? "Exactly a coin flip so far." : "A coin flip would have done better so far."}</span>
            )}
          </span>
          <ChevronRight className="row-chev" size={18} aria-hidden="true" />
        </a>
        {suggestions.length > 0 && <HeadlineSuggestions suggestions={suggestions} />}
      </section>

      {!state.settings.installTipDismissed && !isStandalone() && (
        <div className="install-row">
          <button type="button" className="row pressable" onClick={() => open({ kind: "install" })}>
            <Smartphone size={20} aria-hidden="true" className="row-icon" />
            <span className="row-main">
              <span className="row-title">Add Bird's Eye to your Home Screen</span>
            </span>
            <ChevronRight className="row-chev" size={18} aria-hidden="true" />
          </button>
          <button type="button" className="icon-btn" aria-label="Dismiss home screen tip" onClick={() => dispatch({ type: "settings", patch: { installTipDismissed: true } })}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      )}

      <p className="disclaimer">Not financial advice. Market data from Yahoo Finance; headlines from CNBC.com.</p>
    </div>
  );
}

function BriefingSkeleton() {
  return (
    <div className="view briefing" aria-busy="true">
      <h1 className="sr-only">Briefing</h1>
      <Skeleton w="45%" h={14} />
      <div className="hero">
        <Skeleton w="92%" h={26} />
        <Skeleton w="70%" h={26} />
        <Skeleton w={160} h={52} r={10} />
        <Skeleton h={112} r={8} />
      </div>
      <Skeleton w="40%" h={22} />
      <Skeleton h={44} />
      <Skeleton h={44} />
      <p className="sr-only" role="status">
        Loading prices
      </p>
    </div>
  );
}

export function sliceDays(s: { dates: string[]; closes: number[] }, days: number) {
  const end = s.dates[s.dates.length - 1];
  const start = new Date(Date.parse(`${end}T12:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
  const i = Math.max(0, s.dates.findIndex((d) => d >= start));
  return { dates: s.dates.slice(i), closes: s.closes.slice(i) };
}
