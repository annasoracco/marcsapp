import { useLayoutEffect } from "react";
import { fmtMoney } from "../lib/format";
import { useCountUp } from "../lib/motion";

/**
 * Fraunces ships proportional figures only. To keep the count-up from jittering, every digit sits in a
 * slot as wide as the widest digit, which is exactly what tabular figures do. The slot width is measured
 * from the real font once it has loaded.
 */
export function useTabularDigits() {
  useLayoutEffect(() => {
    const measure = () => {
      const probe = document.createElement("span");
      probe.className = "hero-number probe";
      probe.setAttribute("aria-hidden", "true");
      document.body.appendChild(probe);
      const size = parseFloat(getComputedStyle(probe).fontSize) || 64;
      let max = 0;
      for (const d of "0123456789") {
        probe.textContent = d;
        max = Math.max(max, probe.getBoundingClientRect().width);
      }
      probe.remove();
      if (max > 0) {
        EM.digit = max / size;
        document.documentElement.style.setProperty("--dw", `${EM.digit.toFixed(3)}em`);
      }
    };
    measure();
    document.fonts?.ready.then(measure).catch(() => {});
  }, []);
}

const EM = { digit: 0.7, comma: 0.3, dollar: 0.62 };

/** Font size (px) that fits the formatted number in `width`. */
export function fitSize(text: string, width: number, max = 72, min = 34): number {
  let em = 0;
  for (const ch of text) em += /\d/.test(ch) ? EM.digit : ch === "," ? EM.comma : EM.dollar;
  return Math.max(min, Math.min(max, Math.floor(width / em)));
}

interface Props {
  value: number;
  instant: boolean;
  width: number;
  className?: string;
}

export function HeroNumber({ value, instant, width, className = "" }: Props) {
  const shown = useCountUp(value, 650, instant);
  const final = fmtMoney(value);
  const text = fmtMoney(shown);
  return (
    <p className={`hero-number ${className}`} style={{ fontSize: fitSize(final, width) }}>
      <span className="sr-only">{final}</span>
      <span aria-hidden="true">
        {[...text].map((ch, i) =>
          /\d/.test(ch) ? (
            <span key={text.length - i} className="dg">
              {ch}
            </span>
          ) : (
            <span key={`s${text.length - i}`}>{ch}</span>
          ),
        )}
      </span>
    </p>
  );
}
