import type { ReactNode } from "react";
import { signedPct, trendClass, weight as fmtWeight } from "../lib/format";
import type { Slice } from "../lib/xray";

export function Change({ value, digits = 1, label }: { value: number | null | undefined; digits?: number; label?: string }) {
  const cls = trendClass(value);
  const text = signedPct(value, digits);
  const word = cls === "pos" ? "up" : cls === "neg" ? "down" : "";
  return (
    <span className={`chg ${cls}`} aria-label={label ? `${label} ${word} ${text.replace(/[+\u2212]/, "")}` : undefined}>
      {cls === "pos" ? "\u25B2 " : cls === "neg" ? "\u25BC " : ""}
      {text}
    </span>
  );
}

export interface BarItem {
  key: string;
  label: ReactNode;
  sub?: ReactNode;
  weight: number;
  href?: string;
  tone?: "warn" | "muted";
}

export function BarList({ items, max }: { items: BarItem[]; max?: number }) {
  const top = max ?? Math.max(...items.map((i) => i.weight), 0.0001);
  return (
    <ul className="bars">
      {items.map((it) => {
        const body = (
          <>
            <div className="bar-row">
              <span className="bar-label">{it.label}</span>
              <span className="bar-value">{fmtWeight(it.weight)}</span>
            </div>
            {it.sub && <div className="bar-sub">{it.sub}</div>}
            <div className="bar-track" aria-hidden="true">
              <div className={`bar-fill ${it.tone ?? ""}`} style={{ width: `${Math.max(1, (it.weight / top) * 100)}%` }} />
            </div>
          </>
        );
        return <li key={it.key}>{it.href ? <a className="bar-link" href={it.href}>{body}</a> : body}</li>;
      })}
    </ul>
  );
}

const PALETTE = ["#2a8a93", "#a5acaf", "#4cbb17", "#6f8fa8", "#d1d5d6", "#3c6e71", "#8a9a5b", "#c9a227", "#7a7f82", "#5b7f95", "#b07d62", "#56636b"];

export function StackedBar({ slices, label }: { slices: Slice[]; label: string }) {
  return (
    <figure className="stacked">
      <div className="stacked-track" role="img" aria-label={`${label}: ${slices.map((s) => `${s.label} ${fmtWeight(s.weight)}`).join(", ")}`}>
        {slices.map((s, i) => (
          <div key={s.label} style={{ width: `${s.weight * 100}%`, background: PALETTE[i % PALETTE.length] }} />
        ))}
      </div>
      <figcaption>
        <ul className="legend">
          {slices.map((s, i) => (
            <li key={s.label}>
              <span className="swatch" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden="true" />
              {s.label} <strong>{fmtWeight(s.weight)}</strong>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

export function Card({ title, children, action, className, id }: { title?: ReactNode; children: ReactNode; action?: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`card ${className ?? ""}`} aria-labelledby={id && title ? `${id}-h` : undefined}>
      {(title || action) && (
        <div className="card-head">
          {title && <h2 id={id ? `${id}-h` : undefined}>{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
