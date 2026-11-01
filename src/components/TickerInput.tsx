import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { MarketFile } from "../lib/marketTypes";
import { normalizeSymbol } from "../lib/history";

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  market?: MarketFile;
  /** Allow free text (fund names without tickers). */
  allowFreeText?: boolean;
  placeholder?: string;
  required?: boolean;
  id?: string;
  hint?: string;
  /** Exclude indices from suggestions. */
  tradableOnly?: boolean;
}

interface Option {
  symbol: string;
  name: string;
}

export function searchTickers(market: MarketFile | undefined, query: string, limit = 8, tradableOnly = true): Option[] {
  if (!market) return [];
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const qn = normalizeSymbol(q);
  const exact: Option[] = [];
  const prefix: Option[] = [];
  const name: Option[] = [];
  for (const [symbol, t] of Object.entries(market.t)) {
    if (tradableOnly && t.k === "i") continue;
    const o = { symbol, name: t.n };
    if (symbol === qn) exact.push(o);
    else if (symbol.startsWith(qn)) prefix.push(o);
    else if (q.length >= 2 && t.n.toUpperCase().includes(q)) name.push(o);
  }
  prefix.sort((a, b) => a.symbol.length - b.symbol.length || a.symbol.localeCompare(b.symbol));
  return [...exact, ...prefix, ...name].slice(0, limit);
}

export function TickerInput({ label, value, onChange, market, allowFreeText, placeholder, required, id, hint, tradableOnly = true }: Props) {
  const autoId = useId();
  const inputId = id ?? `ticker-${autoId}`;
  const listId = `${inputId}-list`;
  const hintId = `${inputId}-hint`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const options = useMemo(() => searchTickers(market, value, 8, tradableOnly), [market, value, tradableOnly]);
  const showList = open && options.length > 0 && !(options.length === 1 && options[0].symbol === normalizeSymbol(value));

  const choose = (o: Option) => {
    onChange(o.symbol);
    setOpen(false);
    setActive(-1);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(options[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="field combo">
      <label htmlFor={inputId}>{label}</label>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        aria-describedby={hint ? hintId : undefined}
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="next"
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={(e) => {
          onChange(allowFreeText ? e.target.value : e.target.value.toUpperCase());
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKey}
      />
      {hint && (
        <p className="hint" id={hintId}>
          {hint}
        </p>
      )}
      <ul id={listId} role="listbox" className="combo-list" hidden={!showList} aria-label={`${label} suggestions`}>
        {options.map((o, i) => (
          <li
            key={o.symbol}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            className={i === active ? "active" : undefined}
            onMouseDown={(e) => {
              e.preventDefault();
              choose(o);
            }}
          >
            <span className="sym">{o.symbol}</span>
            <span className="name">{o.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
