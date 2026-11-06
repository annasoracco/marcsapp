import { useLayoutEffect, useState } from "react";
import { fmtMoney } from "../lib/format";
import { useCountUp } from "../lib/motion";

/**
 * Natural widths (in em) of each character the hero number uses, measured from the real font.
 * Fraunces has proportional figures only, so the count-up keeps every slot at the width of the FINAL
 * digit in that position: at rest it reads exactly like proportional type (no gaps), and while counting
 * nothing to the left of a changing digit moves.
 */
const FALLBACK: Record<string, number> = { $: 0.62, ",": 0.3, "0": 0.7, "1": 0.5, "2": 0.64, "3": 0.6, "4": 0.68, "5": 0.62, "6": 0.66, "7": 0.56, "8": 0.68, "9": 0.66 };

export function useGlyphWidths(): Record<string, number> {
  const [widths, setWidths] = useState(FALLBACK);
  useLayoutEffect(() => {
    let alive = true;
    const measure = () => {
      const probe = document.createElement("span");
      probe.className = "hero-number probe";
      probe.setAttribute("aria-hidden", "true");
      document.body.appendChild(probe);
      const size = parseFloat(getComputedStyle(probe).fontSize) || 100;
      const out: Record<string, number> = {};
      for (const ch of Object.keys(FALLBACK)) {
        probe.textContent = ch;
        out[ch] = probe.getBoundingClientRect().width / size;
      }
      probe.remove();
      if (alive && out["0"] > 0) setWidths(out);
    };
    measure();
    document.fonts?.ready.then(measure).catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return widths;
}

/** Font size (px) that fits the formatted number in `width`. */
export function fitSize(text: string, width: number, widths: Record<string, number> = FALLBACK, max = 72, min = 34): number {
  let em = 0;
  for (const ch of text) em += widths[ch] ?? 0.6;
  // Letter-spacing is -0.02em per glyph.
  em -= 0.02 * text.length;
  return Math.max(min, Math.min(max, Math.floor(width / em)));
}

interface Props {
  value: number;
  instant: boolean;
  width: number;
}

export function HeroNumber({ value, instant, width }: Props) {
  const widths = useGlyphWidths();
  const shown = useCountUp(value, 650, instant);
  const final = fmtMoney(value);
  const finalDigits = final.replace(/\D/g, "");
  const cur = String(Math.max(0, Math.round(shown)));
  if (cur.length > finalDigits.length) {
    // Counting down from a longer number: it can't fit the final slots, so show it plainly for a moment.
    return (
      <p className="hero-number" style={{ fontSize: fitSize(final, width, widths) }}>
        <span className="sr-only">{final}</span>
        <span aria-hidden="true">{fmtMoney(shown)}</span>
      </p>
    );
  }
  // Right-align the counting value inside the final number's digit slots.
  const padded = cur.padStart(finalDigits.length, " ");
  let di = 0;
  let seenDigit = false;
  return (
    <p className="hero-number" style={{ fontSize: fitSize(final, width, widths) }}>
      <span className="sr-only">{final}</span>
      <span aria-hidden="true">
        {[...final].map((ch, i) => {
          if (/\d/.test(ch)) {
            const d = padded[di++];
            const blank = d === " ";
            if (!blank) seenDigit = true;
            return (
              <span key={i} className={`dg${blank ? " is-blank" : ""}`} style={{ width: `${widths[ch]}em` }}>
                {blank ? ch : d}
              </span>
            );
          }
          // Commas between not-yet-counted digits stay invisible too.
          const hide = ch === "," && !seenDigit;
          return (
            <span key={i} className={hide ? "is-blank" : undefined}>
              {ch}
            </span>
          );
        })}
      </span>
    </p>
  );
}
