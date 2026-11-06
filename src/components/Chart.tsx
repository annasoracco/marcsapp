import { useMemo, useState } from "react";
import type { Point, Scenario } from "../lib/engine";
import { fmtDay, fmtMoney, fmtMoneyShort, yearOfDay, fmtMonthOfDay } from "../lib/format";
import { useWidth } from "../lib/useWidth";

interface Props {
  scenario: Scenario;
  name: string;
  /** Changes when the chart should replay its draw-in (not during slider drags). */
  drawKey: string;
  height?: number;
}

const GUTTER = 88;
// The top band is kept clear for the scrub readout.
const TOP = 44;
const BOTTOM = 28;

export function pathFor(points: Point[], x: (d: number) => number, y: (v: number) => number): string {
  return points.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
}

/**
 * Lays out right-gutter labels (each wants to sit at its line's end) so none overlap: walk down pushing
 * overlaps apart, then pull the stack back up if it ran past the bottom.
 */
export function layoutLabels(items: { y: number; h: number }[], lo: number, hi: number): number[] {
  const order = items.map((_, i) => i).sort((a, b) => items[a].y - items[b].y);
  const top = new Array<number>(items.length).fill(0);
  let cursor = lo;
  for (const i of order) {
    top[i] = Math.max(cursor, items[i].y - items[i].h / 2);
    cursor = top[i] + items[i].h;
  }
  let limit = hi;
  for (let k = order.length - 1; k >= 0; k--) {
    const i = order[k];
    top[i] = Math.min(top[i], limit - items[i].h);
    limit = top[i];
  }
  return items.map((it, i) => top[i] + it.h / 2);
}

export function Chart({ scenario, name, drawKey, height = 264 }: Props) {
  const [ref, width] = useWidth<HTMLElement>(370);
  // Remembers which series it belongs to, so a new scenario clears it without an effect.
  const [scrubState, setScrubState] = useState<{ pts: Point[]; i: number } | null>(null);
  const plotW = width - GUTTER;
  const plotH = height - TOP - BOTTOM;
  const pts = scenario.series;
  const sp = scenario.sp?.series ?? null;

  const { x, y } = useMemo(() => {
    const d0 = pts[0].day;
    const d1 = Math.max(pts[pts.length - 1].day, d0 + 1);
    let max = scenario.invested;
    for (const p of pts) max = Math.max(max, p.value);
    if (sp) for (const p of sp) max = Math.max(max, p.value);
    max *= 1.06;
    return {
      x: (d: number) => ((d - d0) / (d1 - d0)) * plotW,
      y: (v: number) => TOP + plotH - (v / max) * plotH,
    };
  }, [pts, sp, plotW, plotH, scenario.invested]);

  const main = pathFor(pts, x, y);
  const comp = sp ? pathFor(sp, x, y) : "";
  const last = pts[pts.length - 1];
  const spLast = sp?.[sp.length - 1];
  const baseY = y(scenario.invested);
  const labelYs = layoutLabels(
    [{ y: y(last.value), h: 38 }, { y: spLast ? y(spLast.value) : -999, h: spLast ? 38 : 0 }, { y: baseY, h: 38 }],
    TOP - 6,
    TOP + plotH + 8,
  );
  const [ly, sy, by] = labelYs;
  const loss = scenario.value < scenario.invested;

  const onPointer = (e: React.PointerEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    let best = 0;
    let bestD = Infinity;
    pts.forEach((p, i) => {
      const d = Math.abs(x(p.day) - px);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setScrubState({ pts, i: best });
  };
  const end = () => setScrubState(null);
  const scrub = scrubState && scrubState.pts === pts ? scrubState.i : null;
  const sel = scrub == null ? null : pts[scrub];
  const selSp = scrub == null || !sp ? null : sp[scrub];

  return (
    <figure className="chart" ref={ref}>
      <div className={`chart-readout${sel ? " is-on" : ""}`} aria-live="polite">
        {sel && (
          <>
            <span className="ro-date">{fmtDay(sel.day)}</span>
            <span className="ro-main">
              {name} <b>{fmtMoney(sel.value)}</b>
            </span>
            {selSp && (
              <span className="ro-sp">
                S&amp;P 500 <b>{fmtMoney(selSp.value)}</b>
              </span>
            )}
          </>
        )}
      </div>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${name} grew from ${fmtMoney(scenario.invested)} to ${fmtMoney(scenario.value)}${
          scenario.sp ? `; the S&P 500 grew to ${fmtMoney(scenario.sp.value)}` : ""
        }.`}
      >
        <line className="ch-base" x1={0} x2={plotW} y1={baseY} y2={baseY} />
        <g className="ch-label base" transform={`translate(${plotW + 10},${by})`}>
          <text y={-3}>You put in</text>
          <text className="v" y={14}>
            {fmtMoneyShort(scenario.invested)}
          </text>
        </g>
        {comp && <path key={`c${drawKey}`} className="ch-sp draw" d={comp} pathLength={1} />}
        <path key={`m${drawKey}`} className={`ch-main draw${loss ? " is-loss" : ""}`} d={main} pathLength={1} />
        <circle className="ch-start" cx={x(pts[0].day)} cy={y(pts[0].value)} r={3.5} />
        <circle className="ch-end" cx={x(last.day)} cy={y(last.value)} r={4.5} />
        {spLast && <circle className="ch-sp-end" cx={x(spLast.day)} cy={y(spLast.value)} r={3} />}
        <g className="ch-label main" transform={`translate(${plotW + 10},${ly})`}>
          <text y={-3}>{name}</text>
          <text className="v" y={14}>
            {fmtMoneyShort(last.value)}
          </text>
        </g>
        {spLast && (
          <g className="ch-label sp" transform={`translate(${plotW + 10},${sy})`}>
            <text y={-3}>S&amp;P 500</text>
            <text className="v" y={14}>
              {fmtMoneyShort(spLast.value)}
            </text>
          </g>
        )}
        <text className="ch-axis" x={0} y={height - 6}>
          {fmtMonthOfDay(pts[0].day)}
        </text>
        <text className="ch-axis" x={plotW} y={height - 6} textAnchor="end">
          {yearOfDay(last.day) === yearOfDay(pts[0].day) ? fmtDay(last.day) : fmtMonthOfDay(last.day)}
        </text>
        {sel && (
          <g className="ch-scrub">
            <line x1={x(sel.day)} x2={x(sel.day)} y1={TOP} y2={TOP + plotH} />
            {selSp && <circle className="sp" cx={x(sel.day)} cy={y(selSp.value)} r={3.5} />}
            <circle cx={x(sel.day)} cy={y(sel.value)} r={5} />
          </g>
        )}
        <rect
          className="ch-hit"
          x={0}
          y={0}
          width={plotW}
          height={height}
          onPointerDown={onPointer}
          onPointerMove={(e) => (e.pointerType === "mouse" || e.buttons ? onPointer(e) : undefined)}
          onPointerLeave={(e) => e.pointerType === "mouse" && end()}
        />
      </svg>
    </figure>
  );
}
