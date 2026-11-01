import { useMemo, useState, type FormEvent } from "react";
import { useStore } from "../lib/store";
import { useHistories, useMarket } from "../lib/market";
import { ACTION_LABEL, BENCHMARK, evaluateCall, scorecard, SEGMENTS, type CallResult } from "../lib/calls";
import type { CallAction, CramerCall } from "../lib/types";
import { addDays, todayET } from "../lib/dates";
import { newId } from "../lib/storage";
import { normalizeSymbol } from "../lib/history";
import { longDate, pct, plural, shortDate, signedPct } from "../lib/format";
import { tickerHref } from "../lib/route";
import { TickerInput } from "../components/TickerInput";
import { Card, Change, Empty } from "../components/ui";
import type { MarketFile } from "../lib/marketTypes";

type Filter = "all" | CallAction;

export function CallsView({ prefill }: { prefill?: string }) {
  const { state, dispatch } = useStore();
  const ms = useMarket();
  const market = ms.status === "ready" ? ms.data.market : undefined;
  const news = ms.status === "ready" ? ms.data.news.items : [];
  const [editing, setEditing] = useState<CramerCall | null>(null);
  const [formOpen, setFormOpen] = useState(!!prefill || state.calls.length === 0);
  const [filter, setFilter] = useState<Filter>("all");

  const symbols = useMemo(() => [...state.calls.map((c) => c.symbol), BENCHMARK], [state.calls]);
  const histories = useHistories(market ? symbols : []);
  const results = useMemo<CallResult[]>(
    () =>
      [...state.calls]
        .sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))
        .map((c) => evaluateCall(c, histories[c.symbol], histories[BENCHMARK], !!market?.t[c.symbol])),
    [state.calls, histories, market],
  );
  const score = useMemo(() => scorecard(results), [results]);
  const shown = results.filter((r) => filter === "all" || r.call.action === filter);

  return (
    <>
      <div className="page-head">
        <h1 tabIndex={-1}>Cramer Call Tracker</h1>
        <button
          type="button"
          className="btn primary"
          aria-expanded={formOpen}
          aria-controls="call-form"
          onClick={() => {
            setEditing(null);
            setFormOpen((o) => !o);
          }}
        >
          {formOpen ? "Close" : "+ Log a call"}
        </button>
      </div>

      {formOpen && (
        <CallForm
          key={editing?.id ?? prefill ?? "new"}
          market={market}
          initial={editing ?? undefined}
          prefill={prefill}
          onSave={(call) => {
            dispatch({ type: "saveCall", call });
            setEditing(null);
            setFormOpen(false);
          }}
          onCancel={() => {
            setEditing(null);
            setFormOpen(false);
          }}
        />
      )}

      <Scorecard score={score} total={state.calls.length} />

      <Card
        id="calls"
        title={`Calls (${state.calls.length})`}
        action={
          <div className="seg small" role="group" aria-label="Filter calls">
            {(["all", "buy", "sell", "hold"] as Filter[]).map((f) => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : ACTION_LABEL[f]}
              </button>
            ))}
          </div>
        }
      >
        {state.calls.length === 0 ? (
          <Empty>No calls yet. Tap “Log a call” while the show is on. It takes about five seconds.</Empty>
        ) : shown.length === 0 ? (
          <Empty>No {filter} calls yet.</Empty>
        ) : (
          <ul className="call-list">
            {shown.map((r) => (
              <CallRow
                key={r.call.id}
                r={r}
                market={market}
                onEdit={() => {
                  setEditing(r.call);
                  setFormOpen(true);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                onDelete={() => {
                  if (window.confirm(`Delete the ${ACTION_LABEL[r.call.action]} call on ${r.call.symbol}?`)) dispatch({ type: "deleteCall", id: r.call.id });
                }}
              />
            ))}
          </ul>
        )}
        <p className="fine">
          Returns run from the close on the call date (the show airs after the bell) to the latest price, dividends
          included, versus the S&amp;P 500 (SPY) over the same days.
        </p>
      </Card>

      {news.length > 0 && (
        <Card id="news" title="From the show">
          <ul className="news">
            {news.slice(0, 5).map((n) => (
              <li key={n.link}>
                <a href={n.link} target="_blank" rel="noopener noreferrer">
                  {n.title}
                </a>
                <span className="muted"> · {shortDate(n.date.slice(0, 10))}</span>
              </li>
            ))}
          </ul>
          <p className="fine">Headlines link to CNBC.com. Heard a call? Log it above.</p>
        </Card>
      )}
    </>
  );
}

function Scorecard({ score, total }: { score: ReturnType<typeof scorecard>; total: number }) {
  if (total === 0) return null;
  const verdict =
    score.verdict === "cramer" ? "Cramer is ahead" : score.verdict === "inverse" ? "Inverse Cramer is ahead" : score.verdict === "tie" ? "Dead even" : "Waiting on results";
  return (
    <Card id="score" title="Scorecard" className="score">
      <div className="score-grid">
        <div className="stat big">
          <span className="stat-label">Hit rate</span>
          <span className="stat-value">{score.hitRate === null ? "\u2014" : pct(score.hitRate, 0)}</span>
          <span className="stat-sub">
            {score.graded ? `${score.right} of ${plural(score.graded, "Buy/Sell call")} right` : "No graded calls yet"}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Avg edge vs S&amp;P 500</span>
          <span className="stat-value">
            <Change value={score.avgEdge} />
          </span>
          <span className="stat-sub">Buys: stock minus S&amp;P. Sells: S&amp;P minus stock.</span>
        </div>
      </div>

      <div className="inverse" aria-label="Inverse Cramer comparison">
        <h3>Inverse Cramer</h3>
        <p className="verdict">{verdict}</p>
        <dl className="vs">
          <div>
            <dt>Follow Cramer</dt>
            <dd>
              <Change value={score.avgFollow} />
            </dd>
          </div>
          <div>
            <dt>Do the opposite</dt>
            <dd>
              <Change value={score.avgInverse} />
            </dd>
          </div>
          <div>
            <dt>Just own the S&amp;P</dt>
            <dd>
              <Change value={score.avgMarket} />
            </dd>
          </div>
        </dl>
        <p className="fine">Average return per call. Following means buying his Buys and shorting his Sells; the opposite flips both. Holds aren’t graded.</p>
      </div>

      {(score.best || score.worst) && (
        <div className="best-worst">
          {score.best && <BestWorst label="Best call" r={score.best} />}
          {score.worst && <BestWorst label="Worst call" r={score.worst} />}
        </div>
      )}
    </Card>
  );
}

function BestWorst({ label, r }: { label: string; r: CallResult }) {
  return (
    <a className="bw" href={tickerHref(r.call.symbol)}>
      <span className="stat-label">{label}</span>
      <span className="bw-main">
        <span className={`badge ${r.call.action}`}>{ACTION_LABEL[r.call.action]}</span> {r.call.symbol}
      </span>
      <span className="stat-sub">
        {r.edge !== undefined && r.edge >= 0 ? "Right by " : "Wrong by "}
        {signedPct(Math.abs(r.edge ?? 0)).replace("+", "")} vs S&amp;P · {shortDate(r.call.date)}
      </span>
    </a>
  );
}

function CallRow({ r, market, onEdit, onDelete }: { r: CallResult; market?: MarketFile; onEdit: () => void; onDelete: () => void }) {
  const { call } = r;
  const name = market?.t[call.symbol]?.n;
  return (
    <li className="call">
      <div className="call-top">
        <a className="call-sym" href={tickerHref(call.symbol)}>
          <span className={`badge ${call.action}`}>{ACTION_LABEL[call.action]}</span>
          <span className="sym">{call.symbol}</span>
          {call.sample && <span className="tag">Sample</span>}
        </a>
        <span className="muted call-date">
          {longDate(call.date)}
          {call.segment ? ` · ${call.segment}` : ""}
        </span>
      </div>
      {name && <div className="call-name muted">{name}</div>}
      <CallOutcome r={r} />
      {call.note && <p className="call-note">{call.note}</p>}
      <div className="call-actions">
        <button type="button" className="btn ghost small" onClick={onEdit} aria-label={`Edit ${call.symbol} call`}>
          Edit
        </button>
        <button type="button" className="btn ghost small" onClick={onDelete} aria-label={`Delete ${call.symbol} call`}>
          Delete
        </button>
      </div>
    </li>
  );
}

function CallOutcome({ r }: { r: CallResult }) {
  switch (r.status) {
    case "uncovered":
      return <p className="outcome muted">Not covered yet. Add it to config/extra-tickers.json to track it.</p>;
    case "loading":
      return <p className="outcome muted">Loading prices…</p>;
    case "nodata":
      return <p className="outcome muted">No price history available for this ticker yet.</p>;
    case "tooold":
      return <p className="outcome muted">Too far back. Price history starts {r.dataStart ? longDate(r.dataStart) : "later"}.</p>;
    case "pending":
      return <p className="outcome muted">Tracking starts after the call date’s close.</p>;
    case "ok": {
      const beat = (r.excess ?? 0) > 0;
      return (
        <div className="outcome">
          <dl className="vs compact">
            <div>
              <dt>{r.call.symbol}</dt>
              <dd>
                <Change value={r.stockRet} label={r.call.symbol} />
              </dd>
            </div>
            <div>
              <dt>S&amp;P 500</dt>
              <dd>
                <Change value={r.marketRet} label="S&P 500" />
              </dd>
            </div>
            <div>
              <dt>{beat ? "Beat market" : "Lagged market"}</dt>
              <dd>
                <Change value={r.excess} />
              </dd>
            </div>
          </dl>
          <p className="verdict-line">
            {r.right === null ? (
              <span className="pill neutral">Hold · not graded</span>
            ) : r.right ? (
              <span className="pill good">✓ Cramer right</span>
            ) : (
              <span className="pill bad">✗ Cramer wrong</span>
            )}
            <span className="muted"> over {plural(r.days ?? 0, "day")}</span>
          </p>
        </div>
      );
    }
  }
}

function CallForm({
  market,
  initial,
  prefill,
  onSave,
  onCancel,
}: {
  market?: MarketFile;
  initial?: CramerCall;
  prefill?: string;
  onSave: (c: CramerCall) => void;
  onCancel: () => void;
}) {
  const today = todayET();
  const [symbol, setSymbol] = useState(initial?.symbol ?? prefill ?? "");
  const [action, setAction] = useState<CallAction>(initial?.action ?? "buy");
  const [date, setDate] = useState(initial?.date ?? today);
  const [segment, setSegment] = useState(initial?.segment ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState("");
  const sym = normalizeSymbol(symbol);
  const covered = !!market?.t[sym];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!sym) return setError("Enter a ticker.");
    if (!date || date > today) return setError("Pick a date on or before today.");
    onSave({
      id: initial?.id ?? newId(),
      symbol: sym,
      action,
      date,
      segment: segment || undefined,
      note: note.trim() || undefined,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    });
  };

  return (
    <form id="call-form" className="card form" onSubmit={submit} aria-label={initial ? "Edit call" : "Log a call"} noValidate>
      <TickerInput label="Ticker" value={symbol} onChange={setSymbol} market={market} placeholder="e.g. NVDA" required />
      {sym && market && !covered && <p className="hint warn">{sym} isn’t covered yet. You can still save it.</p>}
      <fieldset className="field">
        <legend>Call</legend>
        <div className="seg" role="radiogroup" aria-label="Call">
          {(["buy", "sell", "hold"] as CallAction[]).map((a) => (
            <label key={a} className={`seg-opt ${a} ${action === a ? "on" : ""}`}>
              <input type="radio" name="action" value={a} checked={action === a} onChange={() => setAction(a)} />
              {ACTION_LABEL[a]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="row2">
        <div className="field">
          <label htmlFor="call-date">Date aired</label>
          <input id="call-date" type="date" value={date} max={today} min={addDays(today, -800)} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="call-seg">Segment (optional)</label>
          <select id="call-seg" value={segment} onChange={(e) => setSegment(e.target.value)}>
            <option value="">None</option>
            {SEGMENTS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="call-note">Note (optional)</label>
        <input id="call-note" type="text" value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} placeholder="What did he say?" />
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <button type="submit" className="btn primary">
          {initial ? "Save changes" : "Save call"}
        </button>
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
