import { useId } from "react";
import type { Series } from "../lib/marketTypes";
import { shortDate, signedPct } from "../lib/format";

const monthYear = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/** "Sep 29 to Oct 30", or "Oct 2025 to Oct 2026" for long spans so the year is clear. */
function rangeLabel(from: string, to: string): string {
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  if (days < 300) return `${shortDate(from)} to ${shortDate(to)}`;
  const f = (d: string) => monthYear.format(new Date(`${d}T12:00:00Z`));
  return `${f(from)} to ${f(to)}`;
}

export interface Line {
  label: string;
  series: Series;
  tone: "main" | "ref" | "alt";
  /** Explicit stroke for comparison lines (tone "alt"). */
  color?: string;
}

/**
 * Percent-change lines from a common start (0%). The main line is colored by its result;
 * the reference line (usually the S&P 500) is quiet silver.
 */
export function ChangeChart({ lines, height = 168, label, compact }: { lines: Line[]; height?: number; label: string; compact?: boolean }) {
  const gid = useId().replace(/:/g, "");
  const W = 360;
  const H = height;
  const PY = 10;
  const usable = lines.filter((l) => l.series.closes.length >= 2 && l.series.closes[0] > 0);
  if (!usable.length) return null;
  const vals = usable.map((l) => l.series.closes.map((c) => c / l.series.closes[0] - 1));
  const all = vals.flat();
  const min = Math.min(0, ...all);
  const max = Math.max(0, ...all);
  const span = max - min || 0.01;
  const y = (v: number) => PY + (1 - (v - min) / span) * (H - 2 * PY);
  const main = usable.findIndex((l) => l.tone === "main");
  const mainVals = vals[main >= 0 ? main : 0];
  const end = mainVals[mainVals.length - 1];
  const up = end >= 0;
  const paths = usable.map((l, i) => {
    const v = vals[i];
    const x = (j: number) => (j / (v.length - 1)) * W;
    return { l, d: v.map((p, j) => `${j ? "L" : "M"}${x(j).toFixed(1)},${y(p).toFixed(1)}`).join(""), last: v[v.length - 1], area: `M0,${y(0)}` + v.map((p, j) => `L${x(j).toFixed(1)},${y(p).toFixed(1)}`).join("") + `L${W},${y(0)}Z` };
  });
  const first = usable[0].series.dates[0];
  const lastDate = usable[0].series.dates[usable[0].series.dates.length - 1];
  const summary = paths.map((p) => `${p.l.label} ${signedPct(p.last)}`).join(", ");
  return (
    <figure className={`chg-chart ${compact ? "compact" : ""}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`${label}. Since ${shortDate(first)}: ${summary}.`}>
        <defs>
          <linearGradient id={`g${gid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={up ? "var(--gain)" : "var(--loss)"} stopOpacity={up ? 0.18 : 0} />
            <stop offset="1" stopColor={up ? "var(--gain)" : "var(--loss)"} stopOpacity={up ? 0 : 0.18} />
          </linearGradient>
        </defs>
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="chart-zero" />
        {paths.map((p) =>
          p.l.tone === "main" ? (
            <g key={p.l.label}>
              <path d={p.area} fill={`url(#g${gid})`} />
              <path d={p.d} className={`chart-line main ${up ? "up" : "down"}`} />
            </g>
          ) : p.l.tone === "alt" ? (
            <path key={p.l.label} d={p.d} className="chart-line alt" style={{ stroke: p.l.color }} />
          ) : (
            <path key={p.l.label} d={p.d} className="chart-line ref" />
          ),
        )}
      </svg>
      {!compact && (
        <figcaption className="chart-legend">
          {paths.map((p) => (
            <span key={p.l.label} className={`legend-item ${p.l.tone}`}>
              <span className={`legend-swatch ${p.l.tone} ${up ? "up" : "down"}`} style={p.l.color ? { background: p.l.color } : undefined} aria-hidden="true" />
              {p.l.label} <strong className="num">{signedPct(p.last)}</strong>
            </span>
          ))}
          <span className="legend-range">{rangeLabel(first, lastDate)}</span>
        </figcaption>
      )}
    </figure>
  );
}

export interface DivRow {
  key: string;
  label: string;
  sub?: string;
  value: number;
  text: string;
  href?: string;
}

/** Bars growing left (negative) or right (positive) from a center line. */
export function DivergingBars({ rows, label }: { rows: DivRow[]; label: string }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1e-6);
  return (
    <ul className="div-bars" aria-label={label}>
      {rows.map((r) => {
        const w = `${(Math.abs(r.value) / max) * 50}%`;
        const pos = r.value >= 0;
        const body = (
          <>
            <span className="div-label">
              <span className="div-name">{r.label}</span>
              {r.sub && <span className="div-sub">{r.sub}</span>}
            </span>
            <span className="div-track" aria-hidden="true">
              <span className={`div-fill ${pos ? "pos" : "neg"}`} style={pos ? { left: "50%", width: w } : { right: "50%", width: w }} />
            </span>
            <span className={`div-val num ${pos ? "pos" : "neg"}`}>{r.text}</span>
          </>
        );
        return <li key={r.key}>{r.href ? <a className="div-row pressable" href={r.href}>{body}</a> : <div className="div-row">{body}</div>}</li>;
      })}
    </ul>
  );
}

export const MIX_COLORS: Record<string, string> = {
  "US stocks": "#3fb8c2",
  International: "#8fa8d8",
  Bonds: "#c9b37e",
  Cash: "#a5acaf",
  Other: "#6b7579",
};

/** One segmented bar of the whole portfolio with a legend of rows. */
export function MixBar({ mix, label }: { mix: { label: string; weight: number }[]; label: string }) {
  const shown = mix.filter((m) => m.weight >= 0.001);
  return (
    <figure className="mix">
      <div className="mix-bar" role="img" aria-label={`${label}: ${shown.map((m) => `${m.label} ${Math.round(m.weight * 100)}%`).join(", ")}`}>
        {shown.map((m) => (
          <span key={m.label} style={{ flexGrow: m.weight, background: MIX_COLORS[m.label] ?? "#6b7579" }} />
        ))}
      </div>
      <figcaption>
        <ul className="mix-legend">
          {shown.map((m) => (
            <li key={m.label}>
              <span className="dot" style={{ background: MIX_COLORS[m.label] ?? "#6b7579" }} aria-hidden="true" />
              <span className="mix-name">{m.label}</span>
              <span className="num">{m.weight < 0.005 ? "<1%" : `${Math.round(m.weight * 100)}%`}</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
