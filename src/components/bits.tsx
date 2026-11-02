import type { Result, Side } from "../lib/game";
import { pct, trend } from "../lib/format";

export function SideMark({ side, who }: { side: Side; who?: string }) {
  return (
    <span className={`side side-${side}`}>
      {who && <span className="side-who">{who} </span>}
      <svg className="side-arrow" viewBox="0 0 10 10" aria-hidden="true">
        {side === "bull" ? <path d="M5 1.5 9 8.5H1z" /> : <path d="M5 8.5 1 1.5h8z" />}
      </svg>
      {side === "bull" ? "Bull" : "Bear"}
    </span>
  );
}

export function ResultMark({ r, label }: { r: Result; label?: string }) {
  const words = { W: "Win", L: "Loss", T: "Tie" } as const;
  return (
    <span className={`result result-${r}`} aria-label={label ?? words[r]} title={words[r]}>
      {r}
    </span>
  );
}

export function Pct({ value, digits = 1 }: { value: number | null | undefined; digits?: number }) {
  return <span className={`num move-${trend(value)}`}>{pct(value, digits)}</span>;
}

export function ExternalIcon() {
  return (
    <svg className="ext" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M4.5 2.5h5v5M9.5 2.5 3 9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`chev${open ? " is-open" : ""}`} viewBox="0 0 12 12" aria-hidden="true">
      <path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
