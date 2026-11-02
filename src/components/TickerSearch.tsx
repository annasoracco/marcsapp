import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { Search } from "lucide-react";
import type { Kind, MarketFile } from "../lib/marketTypes";
import { normalizeSymbol } from "../lib/history";
import { Monogram } from "./bits";

export interface Option {
  symbol: string;
  name: string;
}

export function searchTickers(market: MarketFile | undefined, query: string, limit = 8, tradableOnly = true, only?: Kind[]): Option[] {
  if (!market) return [];
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const qn = normalizeSymbol(q);
  const exact: Option[] = [];
  const prefix: Option[] = [];
  const name: Option[] = [];
  for (const [symbol, t] of Object.entries(market.t)) {
    if (tradableOnly && t.k === "i") continue;
    if (only && !only.includes(t.k)) continue;
    const o = { symbol, name: t.n };
    if (symbol === qn) exact.push(o);
    else if (symbol.startsWith(qn)) prefix.push(o);
    else if (q.length >= 2 && t.n.toUpperCase().includes(q)) name.push(o);
  }
  prefix.sort((a, b) => a.symbol.length - b.symbol.length || a.symbol.localeCompare(b.symbol));
  return [...exact, ...prefix, ...name].slice(0, limit);
}

interface Props {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onPick: (o: Option) => void;
  market?: MarketFile;
  placeholder?: string;
  /** Results render in the flow (sheets, search screens) instead of a floating list. */
  inline?: boolean;
  autoFocus?: boolean;
  allowFreeText?: boolean;
  hideLabel?: boolean;
  limit?: number;
  /** Restrict results to these kinds, e.g. funds only. */
  only?: Kind[];
}

/** Accessible ticker combobox: type a symbol or a company name, pick from covered tickers. */
export function TickerSearch({ label, value, onChange, onPick, market, placeholder, inline, autoFocus, allowFreeText, hideLabel, limit = 6, only }: Props) {
  const id = `ts-${useId().replace(/:/g, "")}`;
  const [active, setActive] = useState(-1);
  const [focused, setFocused] = useState(false);
  const onlyKey = only?.join(",");
  const options = useMemo(() => searchTickers(market, value, limit, true, onlyKey ? (onlyKey.split(",") as Kind[]) : undefined), [market, value, limit, onlyKey]);
  const exactOnly = options.length === 1 && options[0].symbol === normalizeSymbol(value);
  const show = options.length > 0 && (inline || (focused && !exactOnly));

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!show) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter" && (active >= 0 || options.length === 1)) {
      e.preventDefault();
      onPick(options[Math.max(0, active)]);
      setActive(-1);
    } else if (e.key === "Escape" && !inline) {
      setFocused(false);
    }
  };

  return (
    <div className={`search ${inline ? "inline" : "floating"}`}>
      <label htmlFor={id} className={hideLabel ? "sr-only" : "field-label"}>
        {label}
      </label>
      <div className="search-box">
        <Search size={18} aria-hidden="true" className="search-icon" />
        <input
          id={id}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={show}
          aria-controls={`${id}-list`}
          aria-activedescendant={show && active >= 0 ? `${id}-${active}` : undefined}
          autoComplete="off"
          autoCapitalize={allowFreeText ? "words" : "characters"}
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder={placeholder}
          value={value}
          data-autofocus={autoFocus ? "" : undefined}
          onChange={(e) => {
            onChange(e.target.value);
            setActive(-1);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setTimeout(() => setFocused(false), 150)}
          onKeyDown={onKey}
        />
      </div>
      <ul id={`${id}-list`} role="listbox" aria-label={`${label} results`} className="search-list" hidden={!show}>
        {options.map((o, i) => (
          <li
            key={o.symbol}
            id={`${id}-${i}`}
            role="option"
            aria-selected={i === active}
            className={`search-opt pressable ${i === active ? "active" : ""}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(o)}
          >
            <Monogram symbol={o.symbol} size={32} />
            <span className="opt-text">
              <span className="opt-sym">{o.symbol}</span>
              <span className="opt-name">{o.name}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
