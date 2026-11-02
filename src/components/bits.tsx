import { useEffect, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { signedPct, trendClass } from "../lib/format";

/** Signed percent change with an arrow icon and a spoken direction, never color alone. */
export function Delta({ value, digits = 1, label, className, suffix }: { value: number | null | undefined; digits?: number; label?: string; className?: string; suffix?: ReactNode }) {
  const cls = trendClass(value);
  const text = signedPct(value, digits);
  const Icon = cls === "pos" ? ArrowUpRight : cls === "neg" ? ArrowDownRight : Minus;
  const word = cls === "pos" ? "up" : cls === "neg" ? "down" : "unchanged";
  return (
    <span className={`delta ${cls} ${className ?? ""}`}>
      <Icon className="delta-icon" aria-hidden="true" strokeWidth={2.5} />
      <span aria-hidden={label ? true : undefined}>{text}</span>
      {label && <span className="sr-only">{`${label} ${word} ${text.replace(/[+\u2212]/, "")}`}</span>}
      {suffix}
    </span>
  );
}

const TINTS = ["#17393d", "#262b3d", "#352a26", "#1e3526", "#33243a", "#2a3236", "#3a3322", "#1f2f3c"];

export function Monogram({ symbol, size = 40 }: { symbol: string; size?: number }) {
  let h = 0;
  for (const ch of symbol) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const text = symbol.replace(/[^A-Z0-9]/g, "").slice(0, 4);
  return (
    <span
      className="mono"
      aria-hidden="true"
      style={{ width: size, height: size, background: TINTS[h % TINTS.length], fontSize: text.length > 3 ? size * 0.26 : size * 0.3 }}
    >
      {text}
    </span>
  );
}

export function Skeleton({ w = "100%", h = 16, r = 6, className }: { w?: number | string; h?: number; r?: number; className?: string }) {
  return <span className={`skel ${className ?? ""}`} style={{ width: w, height: h, borderRadius: r }} aria-hidden="true" />;
}

const reducedMotion = () => typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Counts up to `target` once, with an ease-out. Static under reduced motion. */
export function useCountUp(target: number | null, duration = 700): number | null {
  const [v, setV] = useState<number | null>(target === null || reducedMotion() ? target : 0);
  useEffect(() => {
    if (target === null || reducedMotion() || typeof requestAnimationFrame !== "function") {
      setV(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setV(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return v;
}

export function SectionHead({ title, action, id }: { title: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="sec-head">
      <h2 id={id}>{title}</h2>
      {action}
    </div>
  );
}

export function Pill({ action }: { action: "buy" | "sell" | "hold" }) {
  return <span className={`pill pill-${action}`}>{action === "buy" ? "Buy" : action === "sell" ? "Sell" : "Hold"}</span>;
}
