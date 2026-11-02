import { useMemo, useState, type FormEvent } from "react";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { useStore } from "../lib/store";
import { useMarket } from "../lib/market";
import { useCallResults } from "../lib/useCalls";
import { ACTION_LABEL, BENCHMARK, SEGMENTS } from "../lib/calls";
import { callStory } from "../lib/insights";
import type { CallAction } from "../lib/types";
import { addDays, todayET } from "../lib/dates";
import { newId } from "../lib/storage";
import { normalizeSymbol, sliceFrom } from "../lib/history";
import { longDate, shortDate, signedPct } from "../lib/format";
import { tickerHref } from "../lib/route";
import { Sheet, useUi } from "../components/Sheet";
import { Delta, Monogram, Pill } from "../components/bits";
import { ChangeChart } from "../components/charts";
import { TickerSearch } from "../components/TickerSearch";
import { EXPLAIN } from "./shared";

export function AddCallSheet({ symbol: initialSymbol, date: initialDate, segment: initialSegment, link, editId }: { symbol?: string; date?: string; segment?: string; link?: string; editId?: string }) {
  const { state, dispatch } = useStore();
  const ms = useMarket();
  const { close } = useUi();
  const market = ms.status === "ready" ? ms.data.market : undefined;
  const editing = editId ? state.calls.find((c) => c.id === editId) : undefined;
  const today = todayET();
  const yesterday = addDays(today, -1);
  const [symbol, setSymbol] = useState(editing?.symbol ?? initialSymbol ?? "");
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<CallAction | null>(editing?.action ?? null);
  const [date, setDate] = useState(editing?.date ?? initialDate ?? today);
  const [picking, setPicking] = useState(!!editing && editing.date !== today && editing.date !== yesterday);
  const [segment, setSegment] = useState(editing?.segment ?? initialSegment ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [details, setDetails] = useState(!!(editing?.note || editing?.segment || initialSegment));
  const [error, setError] = useState("");
  const sym = normalizeSymbol(symbol);
  const info = market?.t[sym];
  const dateChoice = date === today ? "today" : date === yesterday ? "yesterday" : "other";

  const save = (e?: FormEvent) => {
    e?.preventDefault();
    if (!sym) return setError("Pick a ticker first.");
    if (!action) return setError("Choose Buy, Sell, or Hold.");
    if (!date || date > today) return setError("Pick a date on or before today.");
    dispatch({
      type: "saveCall",
      call: {
        id: editing?.id ?? newId(),
        symbol: sym,
        action,
        date,
        segment: segment || undefined,
        note: note.trim() || undefined,
        createdAt: editing?.createdAt ?? new Date().toISOString(),
      },
    });
    close();
  };

  return (
    <Sheet
      title={editing ? `Edit ${editing.symbol} call` : "Log a Cramer call"}
      onClose={close}
      tall
      footer={
        <button type="submit" form="add-call" className="btn primary block" disabled={!sym || !action}>
          {editing ? "Save changes" : action && sym ? `Save ${ACTION_LABEL[action]} on ${sym}` : "Save call"}
        </button>
      }
    >
      <form id="add-call" onSubmit={save} noValidate>
        {sym ? (
          <div className="picked">
            <Monogram symbol={sym} />
            <span className="row-main">
              <span className="row-title">{sym}</span>
              <span className="row-sub">{info ? info.n : "Not covered yet. You can still track it."}</span>
            </span>
            <button type="button" className="btn small quiet" onClick={() => setSymbol("")}>
              Change
            </button>
          </div>
        ) : (
          <TickerSearch
            label="Which stock?"
            value={query}
            onChange={setQuery}
            onPick={(o) => {
              setSymbol(o.symbol);
              setQuery("");
            }}
            market={market}
            placeholder="Ticker or company"
            inline
            autoFocus
            limit={5}
          />
        )}

        <fieldset className="field">
          <legend className="field-label">His call</legend>
          <div className="segmented" role="radiogroup" aria-label="His call">
            {(["buy", "sell", "hold"] as CallAction[]).map((a) => (
              <label key={a} className={`seg-opt ${a} ${action === a ? "on" : ""}`}>
                <input type="radio" name="action" value={a} checked={action === a} onChange={() => setAction(a)} />
                {ACTION_LABEL[a]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend className="field-label">When did it air?</legend>
          <div className="chips">
            <button type="button" className="chip" aria-pressed={dateChoice === "today" && !picking} onClick={() => { setDate(today); setPicking(false); }}>
              Today
            </button>
            <button type="button" className="chip" aria-pressed={dateChoice === "yesterday" && !picking} onClick={() => { setDate(yesterday); setPicking(false); }}>
              Yesterday
            </button>
            <button type="button" className="chip" aria-pressed={picking || dateChoice === "other"} onClick={() => setPicking(true)}>
              {dateChoice === "other" && !picking ? shortDate(date) : "Pick a date"}
            </button>
          </div>
          {picking && (
            <div className="date-pick">
              <label htmlFor="call-date" className="sr-only">
                Date aired
              </label>
              <input id="call-date" type="date" value={date} max={today} min={addDays(today, -800)} onChange={(e) => setDate(e.target.value)} />
            </div>
          )}
        </fieldset>

        {!details ? (
          <button type="button" className="link-btn" onClick={() => setDetails(true)}>
            Add segment or note
          </button>
        ) : (
          <>
            <fieldset className="field">
              <legend className="field-label">Segment</legend>
              <div className="chips wrap">
                {SEGMENTS.slice(0, 5).map((s) => (
                  <button key={s} type="button" className="chip" aria-pressed={segment === s} onClick={() => setSegment(segment === s ? "" : s)}>
                    {s}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="field">
              <label htmlFor="call-note" className="field-label">
                Note
              </label>
              <input id="call-note" type="text" value={note} maxLength={280} onChange={(e) => setNote(e.target.value)} placeholder="What did he say?" />
            </div>
          </>
        )}

        {link && (
          <p className="source-line">
            From{" "}
            <a href={link} target="_blank" rel="noopener noreferrer">
              this CNBC story <ExternalLink size={13} aria-hidden="true" />
            </a>
            . You pick the call; nothing is added automatically.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}

export function CallSheet({ id }: { id: string }) {
  const { dispatch } = useStore();
  const ms = useMarket();
  const { close, open } = useUi();
  const { results, histories } = useCallResults();
  const [confirm, setConfirm] = useState(false);
  const r = results.find((x) => x.call.id === id);
  const market = ms.status === "ready" ? ms.data.market : undefined;
  const lines = useMemo(() => {
    if (!r?.baseDate) return [];
    const s = histories[r.call.symbol];
    const m = histories[BENCHMARK];
    if (!s || !m) return [];
    return [
      { label: r.call.symbol, series: sliceFrom(s, r.baseDate), tone: "main" as const },
      { label: "S&P 500", series: sliceFrom(m, r.baseDate), tone: "ref" as const },
    ];
  }, [r, histories]);
  if (!r) {
    return (
      <Sheet title="Call" onClose={close}>
        <p className="lead">This call was deleted.</p>
      </Sheet>
    );
  }
  const { call } = r;
  return (
    <Sheet
      title={`${call.symbol} ${ACTION_LABEL[call.action]} call`}
      onClose={close}
      tall
      footer={
        <div className="btn-row">
          <button type="button" className="btn quiet" onClick={() => open({ kind: "addCall", editId: call.id })}>
            <Pencil size={16} aria-hidden="true" /> Edit
          </button>
          <button
            type="button"
            className={`btn ${confirm ? "danger" : "quiet"}`}
            onClick={() => {
              if (!confirm) return setConfirm(true);
              dispatch({ type: "deleteCall", id: call.id });
              close();
            }}
          >
            <Trash2 size={16} aria-hidden="true" /> {confirm ? "Tap again to delete" : "Delete"}
          </button>
        </div>
      }
    >
      <div className="picked">
        <Monogram symbol={call.symbol} />
        <span className="row-main">
          <span className="row-title">
            {market?.t[call.symbol]?.n ?? call.symbol} <Pill action={call.action} />
          </span>
          <span className="row-sub">
            Aired {longDate(call.date)}
            {call.segment ? ` · ${call.segment}` : ""}
          </span>
        </span>
      </div>
      <p className="lead story">{callStory(r)}</p>
      {r.status === "ok" && (
        <dl className="stat-row">
          <div>
            <dt>{call.symbol}</dt>
            <dd>
              <Delta value={r.stockRet} label={call.symbol} />
            </dd>
          </div>
          <div>
            <dt>S&amp;P 500</dt>
            <dd>
              <Delta value={r.marketRet} label="S&P 500" />
            </dd>
          </div>
          <div>
            <dt>Difference</dt>
            <dd>
              <span className={`num ${(r.excess ?? 0) >= 0 ? "pos" : "neg"}`}>{signedPct(r.excess)}</span>
            </dd>
          </div>
        </dl>
      )}
      {lines.length > 0 && <ChangeChart lines={lines} label={`${call.symbol} vs the S&P 500 since the call`} />}
      {call.note && <blockquote className="note">“{call.note}”</blockquote>}
      <a className="link-btn" href={tickerHref(call.symbol)} onClick={() => close()}>
        Open {call.symbol} details
      </a>
    </Sheet>
  );
}

export function ExplainSheet({ term }: { term: string }) {
  const { close } = useUi();
  const e = EXPLAIN[term] ?? { title: "What this means", body: [] };
  return (
    <Sheet title={e.title} onClose={close}>
      {e.body.map((p) => (
        <p key={p} className="lead">
          {p}
        </p>
      ))}
      <button type="button" className="btn primary block" onClick={close} data-autofocus="">
        Got it
      </button>
    </Sheet>
  );
}
