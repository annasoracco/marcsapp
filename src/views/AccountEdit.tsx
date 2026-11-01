import { useState, type FormEvent } from "react";
import { useStore } from "../lib/store";
import { useMarket } from "../lib/market";
import { ACCOUNT_TYPES, type Account, type AccountType, type Holding } from "../lib/types";
import { newId } from "../lib/storage";
import { normalizeSymbol } from "../lib/history";
import { navigate } from "../lib/route";
import { TickerInput } from "../components/TickerInput";

type Mode = "shares" | "pct" | "cash";
interface Row {
  id: string;
  mode: Mode;
  symbol: string;
  amount: string;
}

function toRows(a?: Account): Row[] {
  if (!a || a.holdings.length === 0) return [{ id: newId(), mode: "pct", symbol: "", amount: "" }];
  return a.holdings.map((h) =>
    h.kind === "cash"
      ? { id: h.id, mode: "cash", symbol: "", amount: String(h.pct) }
      : h.kind === "shares"
        ? { id: h.id, mode: "shares", symbol: h.symbol, amount: String(h.shares) }
        : { id: h.id, mode: "pct", symbol: h.symbol, amount: String(h.pct) },
  );
}

export function AccountEdit({ id }: { id: string }) {
  const { state, dispatch } = useStore();
  const ms = useMarket();
  const market = ms.status === "ready" ? ms.data.market : undefined;
  const existing = state.accounts.find((a) => a.id === id);
  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState<AccountType>(existing?.type ?? "Brokerage");
  const [portfolioPct, setPortfolioPct] = useState(existing?.portfolioPct ? String(existing.portfolioPct) : "");
  const [rows, setRows] = useState<Row[]>(() => toRows(existing));
  const [error, setError] = useState("");

  if (id !== "new" && !existing) {
    return (
      <>
        <h1 tabIndex={-1}>Account not found</h1>
        <a className="btn ghost" href="#/xray">
          Back to X-ray
        </a>
      </>
    );
  }

  const update = (rid: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === rid ? { ...r, ...patch } : r)));
  const pctTotal = rows.filter((r) => r.mode !== "shares").reduce((a, r) => a + (Number(r.amount) || 0), 0);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError("Give the account a name, like “Fidelity Roth”.");
    const holdings: Holding[] = [];
    for (const r of rows) {
      const amt = Number(r.amount);
      if (r.mode === "cash") {
        if (amt > 0) holdings.push({ id: r.id, kind: "cash", pct: Math.min(amt, 100) });
        continue;
      }
      if (!r.symbol.trim()) continue;
      if (!(amt > 0)) return setError(`Enter an amount for ${r.symbol}.`);
      if (r.mode === "shares") {
        const sym = normalizeSymbol(r.symbol);
        if (!market?.t[sym]) return setError(`${sym} isn’t covered yet, so it has no price. Switch it to “% of account”.`);
        holdings.push({ id: r.id, kind: "shares", symbol: sym, shares: amt });
      } else {
        const sym = normalizeSymbol(r.symbol);
        holdings.push({ id: r.id, kind: "pct", symbol: market?.t[sym] ? sym : r.symbol.trim(), pct: Math.min(amt, 100) });
      }
    }
    const pp = Number(portfolioPct);
    dispatch({
      type: "saveAccount",
      account: {
        id: existing?.id ?? newId(),
        name: name.trim(),
        type,
        portfolioPct: pp > 0 ? Math.min(pp, 100) : undefined,
        holdings,
        sample: existing?.sample,
      },
    });
    navigate("/xray");
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="page-head">
        <h1 tabIndex={-1}>{existing ? "Edit account" : "New account"}</h1>
      </div>
      <p className="lede small">Share counts stay on this phone and are only shown on this screen. Everywhere else you’ll see percentages.</p>
      <div className="card">
        <div className="field">
          <label htmlFor="acct-name">Account name</label>
          <input id="acct-name" type="text" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Schwab brokerage" required />
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="acct-type">Type</label>
            <select id="acct-type" value={type} onChange={(e) => setType(e.target.value as AccountType)}>
              {ACCOUNT_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="acct-pct">Share of all your investments (%)</label>
            <input id="acct-pct" type="number" inputMode="decimal" min={0} max={100} step="any" value={portfolioPct} onChange={(e) => setPortfolioPct(e.target.value)} placeholder="Optional" aria-describedby="acct-pct-hint" />
          </div>
        </div>
        <p className="hint" id="acct-pct-hint">
          Optional. A rough guess is fine. Leave blank and it’s worked out from share counts, or estimated.
        </p>
      </div>

      <div className="card">
        <h2>Holdings</h2>
        <p className="hint">Enter a ticker with shares, or any fund as a % of this account (401(k) funds without tickers work too).</p>
        <ul className="holding-rows">
          {rows.map((r, i) => (
            <li key={r.id} className="holding-row">
              <div className="seg small" role="radiogroup" aria-label={`Holding ${i + 1} entry type`}>
                {(
                  [
                    ["pct", "% of acct"],
                    ["shares", "Shares"],
                    ["cash", "Cash"],
                  ] as [Mode, string][]
                ).map(([m, l]) => (
                  <label key={m} className={`seg-opt ${r.mode === m ? "on" : ""}`}>
                    <input type="radio" name={`mode-${r.id}`} checked={r.mode === m} onChange={() => update(r.id, { mode: m })} />
                    {l}
                  </label>
                ))}
              </div>
              <div className="row2">
                {r.mode === "cash" ? (
                  <p className="cash-label">Cash / money market</p>
                ) : (
                  <TickerInput
                    label={r.mode === "pct" ? "Ticker or fund name" : "Ticker"}
                    value={r.symbol}
                    onChange={(v) => update(r.id, { symbol: v })}
                    market={market}
                    allowFreeText={r.mode === "pct"}
                    placeholder={r.mode === "pct" ? "VTSAX or “Stable Value”" : "AAPL"}
                  />
                )}
                <div className="field">
                  <label htmlFor={`amt-${r.id}`}>{r.mode === "shares" ? "Shares" : "% of account"}</label>
                  <input id={`amt-${r.id}`} type="number" inputMode="decimal" min={0} step="any" value={r.amount} onChange={(e) => update(r.id, { amount: e.target.value })} />
                </div>
              </div>
              {r.mode !== "cash" && r.symbol && market && !market.t[normalizeSymbol(r.symbol)] && (
                <p className="hint">{r.mode === "pct" ? "Not covered yet: counted in your mix, without prices." : "Not covered yet: use % of account instead."}</p>
              )}
              <button type="button" className="btn ghost small" onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))} aria-label={`Remove holding ${i + 1}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn ghost" onClick={() => setRows((rs) => [...rs, { id: newId(), mode: rs.at(-1)?.mode === "shares" ? "shares" : "pct", symbol: "", amount: "" }])}>
          + Add holding
        </button>
        <p className={`hint ${pctTotal > 100.01 ? "warn" : ""}`} aria-live="polite">
          Percent holdings add up to {Math.round(pctTotal * 10) / 10}%{rows.some((r) => r.mode === "shares") ? "; share-based holdings fill the rest." : "."}
        </p>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions sticky">
        <button type="submit" className="btn primary">
          Save account
        </button>
        <a className="btn ghost" href="#/xray">
          Cancel
        </a>
        {existing && (
          <button
            type="button"
            className="btn danger"
            onClick={() => {
              if (window.confirm(`Delete ${existing.name}?`)) {
                dispatch({ type: "deleteAccount", id: existing.id });
                navigate("/xray");
              }
            }}
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
