import { useMemo, useRef, useState } from "react";
import type { Point, Scenario } from "../lib/engine";
import { fmtDay, fmtDuration, fmtMoney, fmtMonthOfDay, fmtPct } from "../lib/format";
import { useWidth } from "../lib/useWidth";
import { pathFor } from "./Chart";
import { shortName } from "./Hero";

const H = 232;
const TOP = 30;
const BOTTOM = 26;
const RAIL = 64;
const MAX_GUESS = -0.95;

interface Props {
  scenario: Scenario;
  scenarioKey: string;
}

/** The game: Marc guesses how far it fell from its high before the crash and the climb back draw in. */
export function HeldGame({ scenario: sc, scenarioKey }: Props) {
  const dd = sc.dd;
  const name = shortName(sc.asset.name);
  const playable = !!dd && dd.pct <= -0.1;

  return (
    <section className="section held" id="held" aria-labelledby="held-h">
      <h2 id="held-h" className="section-h">
        Would you have held?
      </h2>
      {!dd ? (
        <p className="section-lede">
          From the day you bought, {name} never closed below an earlier high. A rare, smooth ride.
        </p>
      ) : !playable ? (
        <p className="section-lede">
          Barely a wobble. The worst drop from a high was {fmtPct(dd.pct, false)}, from {fmtMoney(dd.peak.value)} on {fmtDay(dd.peak.day)} to{" "}
          {fmtMoney(dd.trough.value)} on {fmtDay(dd.trough.day)}.
        </p>
      ) : (
        <Game key={scenarioKey} sc={sc} name={name} />
      )}
    </section>
  );
}

function Game({ sc, name }: { sc: Scenario; name: string }) {
  const dd = sc.dd!;
  const [ref, width] = useWidth<HTMLDivElement>();
  const [guess, setGuess] = useState(-0.3);
  const [revealed, setRevealed] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);
  const atStart = dd.peak.day === sc.startDay;

  const plotW = Math.max(160, width - RAIL);
  const plotH = H - TOP - BOTTOM;

  const { before, after, x, y, max, axis } = useMemo(() => {
    const endDay = dd.rec ? Math.min(sc.endDay, dd.rec.day + Math.max(60, (dd.rec.day - dd.peak.day) * 0.25)) : sc.endDay;
    const lead = Math.max(30, (dd.trough.day - dd.peak.day) * 0.35);
    const startDay = Math.max(sc.startDay, dd.peak.day - lead);
    const win = sc.series.filter((p) => p.day >= startDay && p.day <= endDay);
    const pre = win.filter((p) => p.day <= dd.peak.day);
    const post = win.filter((p) => p.day >= dd.peak.day);
    const max = Math.max(...win.map((p) => p.value), dd.peak.value) * 1.06;
    const d0 = win[0]?.day ?? startDay;
    const d1 = Math.max(win[win.length - 1]?.day ?? endDay, d0 + 1);
    return {
      before: pre.length ? pre : [dd.peak],
      after: post,
      x: (d: number) => ((d - d0) / (d1 - d0)) * plotW,
      y: (v: number) => TOP + plotH - (Math.max(0, v) / max) * plotH,
      max,
      axis: [d0, d1] as const,
    };
  }, [sc, dd, plotW, plotH]);

  const guessValue = dd.peak.value * (1 + guess);
  const gy = y(guessValue);

  const fromY = (clientY: number) => {
    const r = railRef.current!.getBoundingClientRect();
    const v = ((TOP + plotH - (clientY - r.top)) / plotH) * max;
    const g = Math.max(MAX_GUESS, Math.min(0, v / dd.peak.value - 1));
    return Math.round(g * 100) / 100;
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (revealed) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = e.pointerId;
    setGuess(fromY(e.clientY));
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (dragging.current !== e.pointerId) return;
    setGuess(fromY(e.clientY));
  };
  const onUp = () => {
    dragging.current = null;
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step: Record<string, number> = { ArrowDown: -0.01, ArrowUp: 0.01, PageDown: -0.1, PageUp: 0.1 };
    if (!(e.key in step) || revealed) return;
    e.preventDefault();
    setGuess((g) => Math.max(MAX_GUESS, Math.min(0, Math.round((g + step[e.key]) * 100) / 100)));
  };

  const off = guess - dd.pct;
  const verdict =
    Math.abs(off) <= 0.05
      ? "Close. You’ve seen a crash before."
      : off > 0
        ? "It was worse than you guessed."
        : "It wasn’t quite that bad.";
  const troughBelowCost = dd.trough.value < sc.invested;

  const peakPt = (p: Point) => (
    <g className="hg-peak">
      <circle cx={x(p.day)} cy={y(p.value)} r={4.5} />
      <text x={Math.min(x(p.day), plotW - 4)} y={y(p.value) - 12} textAnchor={x(p.day) > plotW * 0.6 ? "end" : "start"}>
        High {fmtMoney(p.value)}
      </text>
    </g>
  );

  return (
    <>
      <p className="section-lede">
        {atStart ? (
          <>Right after you bought on {fmtDay(dd.peak.day)}, it started to slide.</>
        ) : (
          <>
            By {fmtDay(dd.peak.day)}, your {fmtMoney(sc.invested)} had grown to {fmtMoney(dd.peak.value)}. Then it started to slide.
          </>
        )}{" "}
        {revealed ? "Here’s how far it went." : "Drag the line to where you think it bottomed out."}
      </p>

      <div className="hg" ref={ref}>
        <svg width={plotW + RAIL} height={H} viewBox={`0 0 ${plotW + RAIL} ${H}`} role="img" aria-label="The drop and the recovery">
          {sc.invested < max && (
            <g className="hg-cost">
              <line x1={0} x2={plotW} y1={y(sc.invested)} y2={y(sc.invested)} />
              <text x={plotW} y={y(sc.invested) + 16} textAnchor="end">
                You put in {fmtMoney(sc.invested)}
              </text>
            </g>
          )}
          <text className="hg-axis" x={0} y={H - 4}>
            {fmtMonthOfDay(axis[0])}
          </text>
          <text className="hg-axis" x={plotW} y={H - 4} textAnchor="end">
            {fmtMonthOfDay(axis[1])}
          </text>
          <path className="hg-line" d={pathFor(before, x, y)} />
          {revealed && <path className="hg-line hg-crash" d={pathFor(after, x, y)} pathLength={1} />}
          {peakPt(dd.peak)}
          <g className={`hg-guess${revealed ? " is-done" : ""}`}>
            <line x1={0} x2={plotW + RAIL - 30} y1={gy} y2={gy} />
            <text x={plotW + RAIL - 34} y={gy - 9} textAnchor="end">
              {revealed ? "Your guess " : ""}
              {fmtPct(guess)} · {fmtMoney(guessValue)}
            </text>
          </g>
          {revealed && (
            <g className="hg-trough">
              <circle cx={x(dd.trough.day)} cy={y(dd.trough.value)} r={5} />
              <text
                x={x(dd.trough.day)}
                y={Math.abs(y(dd.trough.value) + 22 - gy) < 18 ? y(dd.trough.value) - 12 : Math.min(H - BOTTOM + 4, y(dd.trough.value) + 22)}
                textAnchor={x(dd.trough.day) > plotW * 0.6 ? "end" : x(dd.trough.day) < plotW * 0.3 ? "start" : "middle"}
              >
                Bottom {fmtMoney(dd.trough.value)}
              </text>
            </g>
          )}
          {revealed && dd.rec && <circle className="hg-rec" cx={x(dd.rec.day)} cy={y(dd.rec.value)} r={4} />}
        </svg>
        {!revealed && (
          <div
            className="hg-rail"
            ref={railRef}
            style={{ width: RAIL, height: H }}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <div
              className="hg-handle"
              style={{ top: gy - 22 }}
              role="slider"
              tabIndex={0}
              aria-orientation="vertical"
              aria-label="Your guess for the worst drop"
              aria-valuemin={Math.round(MAX_GUESS * 100)}
              aria-valuemax={0}
              aria-valuenow={Math.round(guess * 100)}
              aria-valuetext={`${fmtPct(guess)}, ${fmtMoney(guessValue)}`}
              onKeyDown={onKey}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M7 10l5-5 5 5M7 14l5 5 5-5" />
              </svg>
            </div>
          </div>
        )}
      </div>

      {!revealed ? (
        <button type="button" className="btn primary wide" onClick={() => setRevealed(true)}>
          Show me how far it fell
        </button>
      ) : (
        <div className="hg-result" aria-live="polite">
          <p className="hg-big">
            <span className="hg-glyph" aria-hidden="true">
              ▼
            </span>
            {fmtPct(dd.pct, false)}
            <span className="hg-big-sub">from its high</span>
          </p>
          <p className="hg-verdict">
            You guessed {fmtPct(guess)}. {verdict}
          </p>
          <p className="hg-body">
            {name} fell from {fmtMoney(dd.peak.value)} on {fmtDay(dd.peak.day)} to {fmtMoney(dd.trough.value)} on {fmtDay(dd.trough.day)},{" "}
            {fmtDuration(dd.fallDays)} of watching it shrink.
            {troughBelowCost ? ` At the bottom, your ${fmtMoney(sc.invested)} was worth ${fmtMoney(dd.trough.value)}.` : ""}
          </p>
          <p className="hg-body">
            {dd.rec
              ? `It took ${fmtDuration(dd.recDays!)} to climb back to ${fmtMoney(dd.peak.value)}, in ${fmtMonthOfDay(dd.rec.day)}.`
              : `It still hasn’t climbed back. Today it’s ${fmtPct(dd.belowNow!, false)} below that high.`}
            {dd.rec && sc.value > dd.trough.value
              ? ` Holding on turned it into ${fmtMoney(sc.value)}. Selling at the bottom would have locked in ${fmtMoney(dd.trough.value)}.`
              : ""}
          </p>
          <button type="button" className="btn text" onClick={() => setRevealed(false)}>
            Guess again
          </button>
        </div>
      )}
    </>
  );
}
