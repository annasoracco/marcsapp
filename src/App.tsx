import { useCallback, useEffect, useMemo, useState } from "react";
import type { Dataset } from "./lib/data";
import { isoToDay, monthIndexOfDay } from "./lib/data";
import type { ScenarioInput, StartRef } from "./lib/engine";
import { clampMonth, computeScenario, monthRange, startMonth, surprise } from "./lib/engine";
import { fmtDay, fmtIsoMonth } from "./lib/format";
import type { AppState } from "./lib/store";
import { clearLegacy, DEFAULT_STATE, loadState, saveState } from "./lib/store";
import { useDataset } from "./lib/useDataset";
import { AmountSheet } from "./components/AmountSheet";
import { DateSheet } from "./components/DateSheet";
import { Dock } from "./components/Dock";
import { Footer } from "./components/Footer";
import { HeldGame } from "./components/HeldGame";
import type { Field } from "./components/Hero";
import { Hero, shortName } from "./components/Hero";
import { Moments } from "./components/Moments";
import { ShareSheet } from "./components/ShareSheet";
import { StockSheet } from "./components/StockSheet";

/** Turns saved state into an input the dataset can answer, without rewriting what Marc chose. */
export function resolveInput(ds: Dataset, state: AppState, complete: boolean): ScenarioInput | "loading" {
  let symbol = state.symbol;
  if (!ds.assets.has(symbol)) {
    if (!complete) return "loading";
    symbol = [DEFAULT_STATE.symbol, ds.benchmark, ds.order[0]].find((s) => ds.assets.has(s))!;
  }
  const asset = ds.assets.get(symbol)!;
  let start: StartRef = state.start;
  if (start.kind === "moment") {
    const id = start.id;
    if (!asset.moments.has(id)) {
      const moment = ds.moments.find((m) => m.id === id);
      const m = moment ? monthIndexOfDay(isoToDay(moment.date)) : (DEFAULT_STATE.start as { m: number }).m;
      start = { kind: "month", m: clampMonth(asset, m) };
    }
  } else {
    start = { kind: "month", m: clampMonth(asset, start.m) };
  }
  return { symbol, start, amount: state.amount, real: state.real };
}

type SheetKind = Field | "share" | null;

export function App() {
  const { ds, complete, error } = useDataset();
  const [state, setState] = useState<AppState>(loadState);
  const [dragging, setDragging] = useState(false);
  const [drawNonce, setDrawNonce] = useState(0);
  const [sheet, setSheet] = useState<SheetKind>(null);

  useEffect(() => clearLegacy(), []);
  useEffect(() => saveState(state), [state]);

  const input = useMemo(() => (ds ? resolveInput(ds, state, complete) : "loading"), [ds, state, complete]);
  const scenario = useMemo(() => (ds && input !== "loading" ? computeScenario(ds, input) : null), [ds, input]);

  const update = useCallback((patch: Partial<AppState>, redraw = true) => {
    setState((s) => ({ ...s, ...patch }));
    if (redraw) setDrawNonce((n) => n + 1);
  }, []);

  const onSlide = useCallback(
    (m: number, isDragging: boolean) => {
      setDragging(isDragging);
      update({ start: { kind: "month", m } }, false);
    },
    [update],
  );

  const toTop = () => window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });

  if (error) {
    return (
      <main className="shell empty">
        <p className="empty-title">Prices are updating</p>
        <p className="empty-body">Hindsight couldn’t load its price data just now. Check the connection, then pull to refresh in a minute.</p>
      </main>
    );
  }
  if (!ds || !scenario || input === "loading") {
    return (
      <main className="shell empty" aria-busy="true">
        <p className="empty-title">Hindsight</p>
        <p className="empty-body">Loading real prices…</p>
      </main>
    );
  }

  const asset = scenario.asset;
  const name = shortName(asset.name);
  const range = monthRange(asset);
  const sm = startMonth(asset, scenario.start) ?? range.min;
  const momentId = scenario.start.kind === "moment" ? scenario.start.id : null;
  const moment = momentId ? (ds.moments.find((m) => m.id === momentId) ?? null) : null;
  const drawKey = `${asset.symbol}|${scenario.amount}|${scenario.real}|${drawNonce}`;
  const scenarioKey = `${asset.symbol}|${JSON.stringify(scenario.start)}|${scenario.real}|${scenario.amount}`;
  const cpiMonth = fmtIsoMonth(ds.cpi.last);

  const doSurprise = () => {
    const pick = surprise(ds, input as ScenarioInput);
    if (!pick) return;
    update({ symbol: pick.symbol, start: pick.start });
    toTop();
  };

  return (
    <>
      <header className="masthead">
        <span className="wordmark">Hindsight</span>
        <button type="button" className="mast-share" onClick={() => setSheet("share")}>
          Share
        </button>
      </header>
      <main className="shell">
        <Hero
          ds={ds}
          scenario={scenario}
          moment={moment}
          instant={dragging}
          drawKey={drawKey}
          onEdit={setSheet}
          onHeld={() => document.getElementById("held")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        />

        <section className="section actions" aria-label="Do more with this">
          <div className="form-actions">
            <button type="button" className="btn primary" onClick={() => setSheet("share")}>
              Share this
            </button>
            <button type="button" className="btn secondary" onClick={doSurprise}>
              Surprise me
            </button>
          </div>
          <p className="quiet">Surprise me pulls a dramatic real result from Hindsight’s list, which only holds companies still around today.</p>
          <label className="switch">
            <input type="checkbox" role="switch" checked={scenario.real} onChange={(e) => update({ real: e.target.checked })} />
            <span className="switch-text">
              In today’s dollars
              <span className="switch-sub">Adjusts every amount for inflation, using CPI through {cpiMonth}</span>
            </span>
            <span className="switch-ui" aria-hidden="true" />
          </label>
        </section>

        <HeldGame scenario={scenario} scenarioKey={scenarioKey} />

        <Moments
          ds={ds}
          input={input}
          saved={state.saved}
          onPick={(start) => {
            update({ start });
            toTop();
          }}
          onSave={(d) => update({ saved: [...state.saved, d] }, false)}
          onRemove={(id) => update({ saved: state.saved.filter((d) => d.id !== id) }, false)}
        />

        <Footer ds={ds} />
      </main>

      <Dock
        min={range.min}
        max={range.max}
        value={sm}
        label={moment ? fmtDay(scenario.startDay) : undefined}
        hidden={sheet !== null}
        onChange={onSlide}
      />

      {sheet === "amount" && <AmountSheet amount={state.amount} onPick={(amount) => update({ amount })} onClose={() => setSheet(null)} />}
      {sheet === "stock" && (
        <StockSheet
          ds={ds}
          current={asset.symbol}
          complete={complete}
          onPick={(symbol) => update({ symbol })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "date" && (
        <DateSheet ds={ds} symbol={asset.symbol} month={sm} onPick={(start) => update({ start })} onClose={() => setSheet(null)} />
      )}
      {sheet === "share" && (
        <ShareSheet
          scenario={scenario}
          name={name}
          cpiMonth={cpiMonth}
          isBenchmark={asset.symbol === ds.benchmark}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}
