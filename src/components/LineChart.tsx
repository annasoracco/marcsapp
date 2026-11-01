import type { Series } from "../lib/marketTypes";
import { shortDate, signedPct } from "../lib/format";

/** Percent-change line chart from the first point in the window. Plain SVG. */
export function LineChart({ series, label }: { series: Series; label: string }) {
  const W = 340;
  const H = 150;
  const P = 6;
  const base = series.closes[0];
  if (!base || series.closes.length < 2) return null;
  const vals = series.closes.map((c) => c / base - 1);
  const min = Math.min(0, ...vals);
  const max = Math.max(0, ...vals);
  const span = max - min || 1;
  const x = (i: number) => P + (i / (vals.length - 1)) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - min) / span) * (H - 2 * P);
  const d = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const last = vals[vals.length - 1];
  const color = last >= 0 ? "var(--pos)" : "var(--neg)";
  return (
    <figure className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label}: ${signedPct(last)} from ${shortDate(series.dates[0])}`} preserveAspectRatio="none">
        <line x1={P} x2={W - P} y1={y(0)} y2={y(0)} stroke="var(--line)" strokeDasharray="3 4" />
        <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="chart-cap">
        <span>{shortDate(series.dates[0])}</span>
        <span className={last >= 0 ? "pos" : "neg"}>{signedPct(last)}</span>
        <span>{shortDate(series.dates[series.dates.length - 1])}</span>
      </figcaption>
    </figure>
  );
}
