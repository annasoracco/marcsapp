import { useRef, useState } from "react";
import { fmtMoney } from "../lib/format";
import { MAX_AMOUNT, MIN_AMOUNT } from "../lib/store";
import { Sheet } from "./Sheet";

const PRESETS = [1000, 5000, 10000, 30000, 100000];

export function parseAmount(text: string): number | null {
  const digits = text.replace(/[^\d.]/g, "");
  if (!digits) return null;
  const n = Math.round(Number(digits));
  if (!Number.isFinite(n) || n < MIN_AMOUNT || n > MAX_AMOUNT) return null;
  return n;
}

interface Props {
  amount: number;
  onPick: (n: number) => void;
  onClose: () => void;
}

export function AmountSheet({ amount, onPick, onClose }: Props) {
  const [text, setText] = useState(String(amount));
  const inputRef = useRef<HTMLInputElement>(null);
  const parsed = parseAmount(text);
  const commit = () => {
    if (parsed != null) onPick(parsed);
    onClose();
  };
  return (
    <Sheet title="How much?" onClose={commit}>
      <p className="quiet">Pretend money. It stays on this phone and never leaves it.</p>
      <div className="chips" role="group" aria-label="Quick amounts">
        {PRESETS.map((p) => (
          <button
            type="button"
            key={p}
            className={`chip${parsed === p ? " is-on" : ""}`}
            aria-pressed={parsed === p}
            onClick={() => {
              onPick(p);
              onClose();
            }}
          >
            {fmtMoney(p)}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          commit();
        }}
      >
        <label className="field big">
          <span>Or type any amount</span>
          <span className="money-input">
            <span aria-hidden="true">$</span>
            <input
              ref={inputRef}
              inputMode="numeric"
              autoComplete="off"
              enterKeyHint="done"
              value={text}
              onChange={(e) => setText(e.target.value.replace(/[^\d,]/g, ""))}
              aria-describedby="amount-help"
            />
          </span>
        </label>
        <p id="amount-help" className={parsed == null ? "problem" : "quiet"}>
          {parsed == null ? `Enter a whole number from $1 to ${fmtMoney(MAX_AMOUNT)}.` : `That’s ${fmtMoney(parsed)}.`}
        </p>
        <button type="submit" className="btn primary wide" disabled={parsed == null}>
          Use {parsed == null ? "this amount" : fmtMoney(parsed)}
        </button>
      </form>
    </Sheet>
  );
}
