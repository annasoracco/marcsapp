import { useState } from "react";
import { Check, ChevronRight, Info, Plus, X as XIcon } from "lucide-react";
import { useStore } from "../lib/store";
import { useMarket } from "../lib/market";
import { useCallResults } from "../lib/useCalls";
import { cramerVerdict, p1, type Strategy } from "../lib/insights";
import { headlineSuggestions } from "../lib/news";
import { ACTION_LABEL, type CallResult } from "../lib/calls";
import { shortDate, signedPct } from "../lib/format";
import { useUi } from "../components/Sheet";
import { Monogram, Pill, SectionHead, Skeleton } from "../components/bits";
import { HeadlineSuggestions } from "./shared";
import type { CallAction } from "../lib/types";

type Filter = "all" | CallAction;

export function Cramer() {
  const { state } = useStore();
  const ms = useMarket();
  const { open } = useUi();
  const { results, score, loading } = useCallResults();
  const [filter, setFilter] = useState<Filter>("all");
  const market = ms.status === "ready" ? ms.data.market : undefined;
  const news = ms.status === "ready" ? ms.data.news.items : [];
  const verdict = cramerVerdict(score);
  const shown = results.filter((r) => filter === "all" || r.call.action === filter);
  const suggestions = market ? headlineSuggestions(news, market, state.calls) : [];
  const max = Math.max(...verdict.bars.map((b) => Math.abs(b.value ?? 0)), 0.001);

  return (
    <div className="view cramer">
      <h1 className="large-title" tabIndex={-1}>
        Cramer
      </h1>

      <section className="verdict" aria-labelledby="q-h">
        <h2 id="q-h" className="question">
          Would following Cramer have beaten just buying the S&amp;P?
        </h2>
        {loading ? (
          <>
            <Skeleton w="90%" h={20} />
            <Skeleton h={120} r={8} />
          </>
        ) : (
          <>
            <p className="answer">{verdict.answer}</p>
            {score.graded > 0 && (
              <ul className="strategies" aria-label="Average return per call">
                {verdict.bars.map((b) => (
                  <StrategyBar key={b.key} k={b.key} label={b.label} value={b.value} max={max} winner={verdict.winner === b.key} onExplain={() => open({ kind: "explain", term: b.key })} />
                ))}
              </ul>
            )}
            {score.graded > 0 && (
              <p className="meta-line">
                <span>
                  {score.right} of {score.graded} calls right{score.holds ? ` · ${score.holds} ${score.holds === 1 ? "Hold" : "Holds"} not scored` : ""}
                </span>
                <button type="button" className="info-btn" onClick={() => open({ kind: "explain", term: "right" })} aria-label="What counts as right?">
                  <Info size={16} aria-hidden="true" />
                </button>
              </p>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="calls-h">
        <SectionHead id="calls-h" title={`Your calls${state.calls.length ? ` (${state.calls.length})` : ""}`} />
        {state.calls.length > 0 && (
          <div className="chips" role="group" aria-label="Show">
            {(["all", "buy", "sell", "hold"] as Filter[]).map((f) => (
              <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : `${ACTION_LABEL[f]}s`}
              </button>
            ))}
          </div>
        )}
        {state.calls.length === 0 ? (
          <div className="empty-block">
            <p className="lead">Heard a call on the show? Log it in three taps and Bird's Eye keeps score against the S&amp;P 500.</p>
            <button type="button" className="btn primary" onClick={() => open({ kind: "addCall" })}>
              <Plus size={18} aria-hidden="true" /> Log your first call
            </button>
          </div>
        ) : shown.length === 0 ? (
          <p className="quiet-note">No {filter} calls yet.</p>
        ) : (
          <ul className="rows call-rows">
            {shown.map((r) => (
              <li key={r.call.id}>
                <CallRow r={r} name={market?.t[r.call.symbol]?.n} onOpen={() => open({ kind: "call", id: r.call.id })} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {suggestions.length > 0 && (
        <section aria-label="From the show">
          <HeadlineSuggestions suggestions={suggestions} />
        </section>
      )}

      <p className="disclaimer">Not financial advice. Scores use closing prices with dividends included.</p>

      <button type="button" className="fab" onClick={() => open({ kind: "addCall" })} aria-label="Log a Cramer call">
        <Plus size={26} aria-hidden="true" />
      </button>
    </div>
  );
}

function StrategyBar({ k, label, value, max, winner, onExplain }: { k: Strategy; label: string; value: number | null; max: number; winner: boolean; onExplain: () => void }) {
  const v = value ?? 0;
  const w = `${(Math.abs(v) / max) * 50}%`;
  return (
    <li className={`strategy ${winner ? "winner" : ""} s-${k}`}>
      <div className="strategy-top">
        <button type="button" className="strategy-label" onClick={onExplain} aria-label={`${label}: what does this mean?`}>
          {label}
          <Info size={14} aria-hidden="true" />
        </button>
        {winner && <span className="best-tag">Best</span>}
        <span className={`strategy-val num ${v >= 0 ? "pos" : "neg"}`}>{signedPct(value)}</span>
      </div>
      <span className="strategy-track" aria-hidden="true">
        <span className={`strategy-fill ${v >= 0 ? "pos" : "neg"}`} style={v >= 0 ? { left: "50%", width: w } : { right: "50%", width: w }} />
      </span>
    </li>
  );
}

function CallRow({ r, name, onOpen }: { r: CallResult; name?: string; onOpen: () => void }) {
  const { call } = r;
  return (
    <button type="button" className="row pressable call-row" onClick={onOpen}>
      <Monogram symbol={call.symbol} />
      <span className="row-main">
        <span className="row-title">
          <span className="sym">{call.symbol}</span> <Pill action={call.action} />
        </span>
        <span className="row-sub">
          {shortDate(call.date)}
          {call.segment ? ` · ${call.segment}` : name ? ` · ${shortName(name)}` : ""}
        </span>
      </span>
      <span className="row-end">
        <Outcome r={r} />
      </span>
      <ChevronRight className="row-chev" size={18} aria-hidden="true" />
    </button>
  );
}

function Outcome({ r }: { r: CallResult }) {
  if (r.status === "loading") return <Skeleton w={72} h={14} />;
  if (r.status !== "ok" || r.excess === undefined) {
    const msg = r.status === "pending" ? "Starts after close" : r.status === "uncovered" ? "Not covered" : r.status === "tooold" ? "Too far back" : "No data";
    return <span className="row-sub">{msg}</span>;
  }
  const beat = r.excess >= 0;
  return (
    <>
      <span className={`num vs ${beat ? "pos" : "neg"}`}>
        {signedPct(r.excess)} <span className="vs-word">vs market</span>
      </span>
      {r.right === null ? (
        <span className="verdict-mini neutral">Not scored</span>
      ) : r.right ? (
        <span className="verdict-mini good">
          <Check size={14} aria-hidden="true" strokeWidth={3} /> Right
        </span>
      ) : (
        <span className="verdict-mini bad">
          <XIcon size={14} aria-hidden="true" strokeWidth={3} /> Wrong
        </span>
      )}
      <span className="sr-only">{`${beat ? "Beat" : "Trailed"} the market by ${p1(r.excess)}`}</span>
    </>
  );
}

const shortName = (n: string) => n.replace(/,?\s+(Inc\.?|Corporation|Corp\.?|Company|Co\.?|plc|Ltd\.?|Holdings?)$/i, "");
