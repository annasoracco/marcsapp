const MINUS = "\u2212";

/** "+2.1%", "−0.4%", "0.0%"; "—" when unknown. */
export function pct(x: number | null | undefined, digits = 1): string {
  if (x == null || !Number.isFinite(x)) return "—";
  const s = Math.abs(x * 100).toFixed(digits);
  if (Number(s) === 0) return `${(0).toFixed(digits)}%`;
  return `${x > 0 ? "+" : MINUS}${s}%`;
}

/** Margin between two returns in percentage points: "1.7 pts" (non-breaking). */
export function pts(x: number): string {
  const v = Math.abs(x * 100);
  return `${v.toFixed(1)}\u00a0${v.toFixed(1) === "1.0" ? "pt" : "pts"}`;
}

export function trend(x: number | null | undefined): "up" | "down" | "flat" {
  if (x == null || !Number.isFinite(x) || Math.abs(x) < 0.0005) return "flat";
  return x > 0 ? "up" : "down";
}

export interface WLT {
  w: number;
  l: number;
  t: number;
}

/** "7–3" or "7–3–1" */
export function wl(r: WLT): string {
  return r.t ? `${r.w}\u2013${r.l}\u2013${r.t}` : `${r.w}\u2013${r.l}`;
}

/** Win percentage the football way (ties count half): ".700", "1.000", "—". */
export function winPct(r: WLT): string {
  const n = r.w + r.l + r.t;
  if (!n) return "\u2014";
  const p = (r.w + r.t / 2) / n;
  return p >= 1 ? "1.000" : p.toFixed(3).slice(1);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
