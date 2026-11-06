import { useEffect, useRef, useState } from "react";
import { fmtMonthIndex, fmtMonthIndexLong } from "../lib/format";
import { spring } from "../lib/motion";

interface Props {
  min: number;
  max: number;
  value: number;
  /** Label for the thumb; defaults to the month. Moments show their exact day. */
  label?: string;
  hidden?: boolean;
  onChange: (m: number, dragging: boolean) => void;
}

const yearOf = (m: number) => 1988 + Math.floor(m / 12);

export function Dock({ min, max, value, label, hidden, onChange }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  // Thumb position as a fractional month while dragging or springing; null when at rest on `value`.
  const [pos, setPos] = useState<number | null>(null);
  const drag = useRef<{ id: number; last: number } | null>(null);
  const stopSpring = useRef<() => void>(() => {});
  const span = Math.max(1, max - min);
  const at = pos ?? value;
  const frac = (at - min) / span;

  const monthAt = (clientX: number) => {
    const r = trackRef.current!.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    return min + f * span;
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    stopSpring.current();
    e.currentTarget.setPointerCapture(e.pointerId);
    const m = monthAt(e.clientX);
    drag.current = { id: e.pointerId, last: Math.round(m) };
    setPos(m);
    if (Math.round(m) !== value) onChange(Math.round(m), true);
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    const m = monthAt(e.clientX);
    setPos(m);
    const r = Math.round(m);
    if (r !== drag.current.last) {
      drag.current.last = r;
      onChange(r, true);
    }
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id !== e.pointerId) return;
    const from = monthAt(e.clientX);
    const to = Math.round(from);
    drag.current = null;
    onChange(to, false);
    stopSpring.current = spring(from, to, setPos, () => setPos(null));
  };

  const onKey = (e: React.KeyboardEvent) => {
    const step: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -12, PageUp: 12 };
    let next: number | null = null;
    if (e.key in step) next = value + step[e.key];
    else if (e.key === "Home") next = min;
    else if (e.key === "End") next = max;
    if (next == null) return;
    e.preventDefault();
    onChange(Math.max(min, Math.min(max, next)), false);
  };

  const nudge = (d: number) => onChange(Math.max(min, Math.min(max, value + d)), false);

  const years: number[] = [];
  for (let y = yearOf(min); y <= yearOf(max); y++) years.push(y);
  const activeYear = yearOf(Math.round(at));

  useEffect(() => {
    const el = chipsRef.current?.querySelector<HTMLElement>(`[data-year="${activeYear}"]`);
    const box = chipsRef.current;
    if (!el || !box) return;
    const target = el.offsetLeft - box.clientWidth / 2 + el.offsetWidth / 2;
    box.scrollTo({ left: target, behavior: "auto" });
  }, [activeYear]);

  const pickYear = (y: number) => {
    const month = ((value % 12) + 12) % 12;
    onChange(Math.max(min, Math.min(max, (y - 1988) * 12 + month)), false);
  };

  return (
    <div className={`dock${hidden ? " is-hidden" : ""}`} aria-hidden={hidden || undefined}>
      <div className="dock-row">
        <button type="button" className="nudge" aria-label="One month earlier" onClick={() => nudge(-1)} disabled={value <= min}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.5 6l-6 6 6 6" />
          </svg>
        </button>
        <div
          className="track"
          ref={trackRef}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div className="rail" />
          <div className="rail-fill" style={{ width: `${frac * 100}%` }} />
          <div className="thumb-wrap" style={{ left: `${frac * 100}%` }}>
            <span className="thumb-label">{pos == null && label ? label : fmtMonthIndex(Math.round(at))}</span>
            <div
              className="thumb"
              role="slider"
              tabIndex={0}
              aria-label="Start date"
              aria-valuemin={min}
              aria-valuemax={max}
              aria-valuenow={value}
              aria-valuetext={label ?? fmtMonthIndexLong(value)}
              onKeyDown={onKey}
            />
          </div>
        </div>
        <button type="button" className="nudge" aria-label="One month later" onClick={() => nudge(1)} disabled={value >= max}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9.5 6l6 6-6 6" />
          </svg>
        </button>
      </div>
      <div className="years" ref={chipsRef} role="group" aria-label="Jump to a year">
        {years.map((y) => (
          <button
            type="button"
            key={y}
            data-year={y}
            className={`year${y === activeYear ? " is-on" : ""}`}
            aria-pressed={y === activeYear}
            onClick={() => pickYear(y)}
          >
            {y}
          </button>
        ))}
      </div>
    </div>
  );
}
