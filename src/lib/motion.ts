import { useEffect, useRef, useState } from "react";

const query = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia(query).matches;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const mq = matchMedia(query);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Runs `step(progress)` on animation frames for `ms`, returns a cancel function. */
export function tween(ms: number, step: (p: number) => void, ease = easeOutCubic, done?: () => void): () => void {
  if (ms <= 0 || prefersReducedMotion()) {
    step(1);
    done?.();
    return () => {};
  }
  let raf = 0;
  const t0 = performance.now();
  const frame = (now: number) => {
    const p = Math.min(1, (now - t0) / ms);
    step(ease(p));
    if (p < 1) raf = requestAnimationFrame(frame);
    else done?.();
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

/** A critically-damped-ish spring from `from` to `to`, reporting positions until it settles. */
export function spring(from: number, to: number, step: (x: number) => void, done?: () => void): () => void {
  if (prefersReducedMotion() || from === to) {
    step(to);
    done?.();
    return () => {};
  }
  const k = 520;
  const c = 38;
  let x = from;
  let v = 0;
  let last = performance.now();
  let raf = 0;
  const frame = (now: number) => {
    const dt = Math.min(0.032, (now - last) / 1000);
    last = now;
    const a = -k * (x - to) - c * v;
    v += a * dt;
    x += v * dt;
    if (Math.abs(x - to) < 0.0005 && Math.abs(v) < 0.005) {
      step(to);
      done?.();
      return;
    }
    step(x);
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

/** Animated number: tweens toward `target` over `ms`, or jumps when `instant`. */
export function useCountUp(target: number, ms: number, instant: boolean): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  useEffect(() => {
    const from = shownRef.current;
    if (instant || from === target) {
      shownRef.current = target;
      setShown(target);
      return;
    }
    return tween(ms, (p) => {
      const v = from + (target - from) * p;
      shownRef.current = v;
      setShown(v);
    });
  }, [target, ms, instant]);
  return shown;
}
