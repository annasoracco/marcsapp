import { useMemo, useState } from "react";
import { ArrowLeftRight, ChevronRight, Lock, Plus, X } from "lucide-react";
import { useHistories, useMarket } from "../lib/market";
import type { MarketData } from "../lib/marketTypes";
import {
  companiesInside,
  comparePair,
  compareSummary,
  fundMix,
  fundSectors,
  fundSummary,
  isFund,
  mixList,
  performance,
  perfSentence,
  POPULAR_FUNDS,
  sharedHoldings,
  spSectors,
} from "../lib/funds";
import { SECTOR_SHORT, p0, p1 } from "../lib/insights";
import { shortName } from "../lib/names";
import { signedPct } from "../lib/format";
import { sliceFrom } from "../lib/history";
import { addDays } from "../lib/dates";
import { navigate, tickerHref } from "../lib/route";
import { TickerSearch } from "../components/TickerSearch";
import { Delta, Monogram, SectionHead, Skeleton } from "../components/bits";
import { ChangeChart, MixBar } from "../components/charts";

const COMPARE_COLORS = ["#4fd1c5", "#c9b37e", "#9db4ff"];

export function Funds({ route }: { route: string[] }) {
  const ms = useMarket();
  const data = ms.status === "ready" ? ms.data : undefined;
  const compare = route[1] === "compare";
  const picked = compare ? (route[2] ?? "").split(",").filter(Boolean).slice(0, 3) : route[1] ? [route[1]] : [];

  return (
    <div className="view funds">
      <h1 className="large-title" tabIndex={-1}>
        Fund X-ray
      </h1>
      <p className="subtitle">
        <Lock size={14} aria-hidden="true" /> Look inside any fund. Nothing about your own accounts is needed or saved.
      </p>
      <div className="segmented wide" role="tablist" aria-label="Mode">
        <button type="button" role="tab" aria-selected={!compare} className={`seg-opt ${!compare ? "on" : ""}`} onClick={() => navigate(picked[0] ? `/funds/${picked[0]}` : "/funds")}>
          One fund
        </button>
        <button type="button" role="tab" aria-selected={compare} className={`seg-opt ${compare ? "on" : ""}`} onClick={() => navigate(`/funds/compare/${picked.join(",")}`)}>
          <ArrowLeftRight size={16} aria-hidden="true" /> Compare
        </button>
      </div>
      {!data ? (
        <div aria-busy="true">
          <Skeleton h={44} />
          <Skeleton w="80%" h={22} />
          <Skeleton h={14} r={7} />
        </div>
      ) : compare ? (
        <Compare data={data} picked={picked.filter((s) => isFund(data.market, s))} />
      ) : (
        <Single data={data} symbol={picked[0] && isFund(data.market, picked[0]) ? picked[0] : undefined} />
      )}
      <p className="disclaimer">Not financial advice. Holdings and sector data come from each fund's latest published top holdings.</p>
    </div>
  );
}

function FundPicker({ data, onPick, label, exclude = [] }: { data: MarketData; onPick: (s: string) => void; label: string; exclude?: string[] }) {
  const [q, setQ] = useState("");
  return (
    <div className="picker">
      <TickerSearch
        label={label}
        hideLabel
        value={q}
        onChange={setQ}
        onPick={(o) => {
          setQ("");
          onPick(o.symbol);
        }}
        market={data.market}
        placeholder="Search funds, like VOO or Fidelity 500"
        only={["e", "f"]}
        limit={6}
      />
      <div className="chips wrap" aria-label="Popular funds">
        {POPULAR_FUNDS.filter((s) => data.market.t[s] && !exclude.includes(s)).map((s) => (
          <button key={s} type="button" className="chip" onClick={() => onPick(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Single({ data, symbol }: { data: MarketData; symbol?: string }) {
  const { market, funds } = data;
  const h = useHistories(symbol ? [symbol, "SPY"] : []);
  const perf = useMemo(() => (symbol ? performance(h[symbol], h.SPY) : []), [symbol, h]);
  if (!symbol) {
    return (
      <>
        <FundPicker data={data} label="Find a fund" onPick={(s) => navigate(`/funds/${s}`)} />
        <p className="lead pad-top">Pick any ETF or mutual fund to see what it really holds, how it's split across sectors, and how it has done against the S&amp;P 500.</p>
      </>
    );
  }
  const t = market.t[symbol];
  const inside = companiesInside(symbol, market, funds);
  const sectors = fundSectors(symbol, funds);
  const sp = spSectors(funds);
  const secRows = Object.keys(SECTOR_SHORT)
    .map((s) => ({ s, you: sectors[s] ?? 0, mkt: sp[s] ?? 0 }))
    .filter((r) => r.you > 0.0005 || r.mkt > 0.0005)
    .sort((a, b) => b.you - a.you);
  const scale = Math.max(...secRows.map((r) => Math.max(r.you, r.mkt)), 0.01);
  const summary = fundSummary(symbol, market, funds);
  const perfLine = perfSentence(symbol, perf);
  const s = h[symbol];
  const spH = h.SPY;
  const start = s ? addDays(s.dates[s.dates.length - 1], -365) : "";

  return (
    <>
      <div className="fund-head">
        <Monogram symbol={symbol} size={44} />
        <div className="row-main">
          <p className="fund-sym">{symbol}</p>
          <p className="row-sub">{t.n}</p>
        </div>
        <Delta value={t.c} label={`${symbol} today`} />
      </div>
      <div className="fund-actions">
        <button type="button" className="btn small quiet" onClick={() => navigate(`/funds/compare/${symbol}`)}>
          <ArrowLeftRight size={16} aria-hidden="true" /> Compare with another
        </button>
        <button type="button" className="btn small ghost" onClick={() => navigate("/funds")}>
          Pick a different fund
        </button>
      </div>

      <section className="hero" aria-label={`${symbol} in plain English`}>
        {summary.map((line, i) => (
          <p key={line} className={i === 0 ? "hero-sentence small" : "lead"}>
            {line}
          </p>
        ))}
        {perfLine && <p className="lead">{perfLine}</p>}
        <MixBar mix={mixList(fundMix(symbol, market, funds))} label={`${symbol} mix`} />
      </section>

      {inside.companies.length > 0 && (
        <section aria-labelledby="top-h">
          <SectionHead id="top-h" title={inside.subFunds.length ? "Biggest companies inside" : "Top holdings"} />
          {inside.subFunds.length > 0 && (
            <p className="fine top">
              Built from {inside.subFunds.map((f) => `${f.name} (${p0(f.weight)})`).join(", ")}.
            </p>
          )}
          <ul className="rows weight-rows">
            {inside.companies.slice(0, 10).map((c) => (
              <li key={c.symbol || c.name}>
                <a className="row pressable" href={c.symbol && market.t[c.symbol] ? tickerHref(c.symbol) : undefined}>
                  <span className="row-main">
                    <span className="row-title">{c.name}</span>
                    <span className="wbar" aria-hidden="true">
                      <span style={{ width: `${(c.weight / inside.companies[0].weight) * 100}%` }} />
                    </span>
                  </span>
                  <span className="row-end num">{p1(c.weight)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {secRows.length > 0 && Object.keys(sectors).length > 0 && (
        <section aria-labelledby="fsec-h">
          <SectionHead id="fsec-h" title="Sectors vs the S&P 500" />
          <ul className="bullets">
            {secRows.map((r) => (
              <li key={r.s} className="bullet">
                <span className="b-label">{SECTOR_SHORT[r.s]}</span>
                <span className="b-track" aria-hidden="true">
                  <span className="b-fill" style={{ width: `${(r.you / scale) * 100}%` }} />
                  <span className="b-mark" style={{ left: `${(r.mkt / scale) * 100}%` }} />
                </span>
                <span className="b-val num">
                  {p0(r.you)}
                  <span className="b-vs"> vs {p0(r.mkt)}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="legend-inline">
            <span className="b-key you" aria-hidden="true" /> {symbol} <span className="b-key mkt" aria-hidden="true" /> S&amp;P 500
          </p>
        </section>
      )}

      <section aria-labelledby="perf-h">
        <SectionHead id="perf-h" title="Performance vs the S&P 500" />
        <PerfTable symbols={[symbol]} perfs={[perf]} />
        {s && spH ? (
          <ChangeChart
            label={`${symbol} vs the S&P 500, past year`}
            lines={[
              { label: symbol, series: sliceFrom(s, start), tone: "main" },
              { label: "S&P 500", series: sliceFrom(spH, start), tone: "ref" },
            ]}
          />
        ) : (
          <Skeleton h={168} r={8} />
        )}
      </section>
      <a className="link-btn" href={tickerHref(symbol)}>
        Open {symbol} quote and watch it <ChevronRight size={16} aria-hidden="true" />
      </a>
    </>
  );
}

function PerfTable({ symbols, perfs, colors }: { symbols: string[]; perfs: ReturnType<typeof performance>[]; colors?: string[] }) {
  const rows = perfs[0] ?? [];
  return (
    <table className="perf">
      <caption className="sr-only">Returns by period, with the S&amp;P 500 for comparison</caption>
      <thead>
        <tr>
          <th scope="col">Period</th>
          {symbols.map((s, i) => (
            <th key={s} scope="col">
              {colors && <span className="dot" style={{ background: colors[i] }} aria-hidden="true" />}
              {s}
            </th>
          ))}
          <th scope="col">S&amp;P 500</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, ri) => (
          <tr key={r.key}>
            <th scope="row">{r.label}</th>
            {perfs.map((p, i) => {
              const v = p[ri]?.fund ?? null;
              const beat = v !== null && r.sp !== null ? v >= r.sp : null;
              return (
                <td key={symbols[i]} className={`num ${v === null ? "" : v >= 0 ? "pos" : "neg"}`}>
                  {signedPct(v)}
                  {beat !== null && symbols.length === 1 && <span className="sr-only">{beat ? ", ahead of the S&P 500" : ", behind the S&P 500"}</span>}
                </td>
              );
            })}
            <td className="num muted">{signedPct(r.sp)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Compare({ data, picked }: { data: MarketData; picked: string[] }) {
  const { market, funds } = data;
  const h = useHistories(picked.length ? [...picked, "SPY"] : []);
  const set = (list: string[]) => navigate(`/funds/compare/${list.join(",")}`);
  const perfs = picked.map((s) => performance(h[s], h.SPY));
  const pairs: ReturnType<typeof comparePair>[] = [];
  for (let i = 0; i < picked.length; i++) for (let j = i + 1; j < picked.length; j++) pairs.push(comparePair(picked[i], picked[j], market, funds));
  const shared = picked.length >= 2 ? sharedHoldings(picked, market, funds).slice(0, 8) : [];
  const ready = picked.every((s) => h[s] !== undefined) && h.SPY !== undefined;
  const summary = ready ? compareSummary(picked, perfs) : null;
  const end = h.SPY ? h.SPY.dates[h.SPY.dates.length - 1] : "";
  const start = end ? addDays(end, -365) : "";

  return (
    <>
      <ul className="compare-slots" aria-label="Funds being compared">
        {picked.map((s, i) => (
          <li key={s} className="slot">
            <span className="dot" style={{ background: COMPARE_COLORS[i] }} aria-hidden="true" />
            <span className="row-main">
              <span className="row-title">{s}</span>
              <span className="row-sub">{shortName(market.t[s].n)}</span>
            </span>
            <button type="button" className="icon-btn" aria-label={`Remove ${s}`} onClick={() => set(picked.filter((x) => x !== s))}>
              <X size={18} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
      {picked.length < 3 && (
        <div className="add-slot">
          <p className="fine top">
            <Plus size={14} aria-hidden="true" /> {picked.length === 0 ? "Pick two or three funds to compare." : picked.length === 1 ? "Add one more fund." : "Add a third fund, or read the comparison below."}
          </p>
          <FundPicker data={data} label="Add a fund to compare" exclude={picked} onPick={(s) => !picked.includes(s) && set([...picked, s])} />
        </div>
      )}

      {picked.length >= 2 && (
        <>
          <section className="hero" aria-label="How they compare">
            {pairs.map((p) => (
              <p key={p.a + p.b} className={pairs.length === 1 ? "hero-sentence small" : "lead strong"}>
                {p.sentence}
              </p>
            ))}
            {summary && <p className="lead">{summary}</p>}
          </section>

          {shared.length > 0 && (
            <section aria-labelledby="shared-h">
              <SectionHead id="shared-h" title="Shared top holdings" />
              <table className="perf">
                <caption className="sr-only">Weight of each shared company in each fund</caption>
                <thead>
                  <tr>
                    <th scope="col">Company</th>
                    {picked.map((s, i) => (
                      <th key={s} scope="col">
                        <span className="dot" style={{ background: COMPARE_COLORS[i] }} aria-hidden="true" />
                        {s}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shared.map((r) => (
                    <tr key={r.symbol}>
                      <th scope="row">{r.name}</th>
                      {r.weights.map((w, i) => (
                        <td key={picked[i]} className="num">
                          {w === null ? "\u2014" : p1(w)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section aria-labelledby="cperf-h">
            <SectionHead id="cperf-h" title="Performance side by side" />
            <PerfTable symbols={picked} perfs={perfs} colors={COMPARE_COLORS} />
            {ready && h.SPY ? (
              <ChangeChart
                label="Past year, percent change"
                lines={[
                  ...picked.filter((s) => h[s]).map((s) => ({ label: s, series: sliceFrom(h[s]!, start), tone: "alt" as const, color: COMPARE_COLORS[picked.indexOf(s)] })),
                  { label: "S&P 500", series: sliceFrom(h.SPY, start), tone: "ref" as const },
                ]}
              />
            ) : (
              <Skeleton h={168} r={8} />
            )}
          </section>
        </>
      )}
    </>
  );
}
