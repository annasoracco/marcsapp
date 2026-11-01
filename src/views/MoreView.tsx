import { useRef, useState } from "react";
import { useStore } from "../lib/store";
import { useMarket } from "../lib/market";
import { makeBackup, parseBackup } from "../lib/storage";
import { stamp } from "../lib/format";
import { todayET } from "../lib/dates";
import { Card } from "../components/ui";
import { InstallTip } from "../components/InstallTip";

export function MoreView() {
  const { state, dispatch } = useStore();
  const ms = useMarket();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const meta = ms.status === "ready" ? ms.data.meta : undefined;

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(makeBackup(state), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `marcsapp-backup-${todayET()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg("Backup saved. Keep it somewhere safe, like Files or iCloud Drive.");
  };

  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      const next = parseBackup(await file.text());
      if (window.confirm(`Replace everything on this phone with this backup (${next.accounts.length} accounts, ${next.calls.length} calls)?`)) {
        dispatch({ type: "replace", state: next });
        setMsg("Backup restored.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn’t read that file.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <div className="page-head">
        <h1 tabIndex={-1}>More</h1>
      </div>

      <Card id="data" title="Market data">
        {meta ? (
          <ul className="plain">
            <li>Prices as of {stamp(meta.quotesAsOf)}</li>
            <li>
              Source:{" "}
              {meta.source === "live" ? "Yahoo Finance, refreshed about every 30 minutes while the market is open" : meta.source === "cached" ? "last good copy (the latest refresh failed)" : "sample data (live prices unavailable)"}
            </li>
            <li>{meta.counts.tickers} tickers covered: S&amp;P 500, Nasdaq-100, Dow 30, popular ETFs and 401(k) funds</li>
          </ul>
        ) : (
          <p className="muted">Loading…</p>
        )}
      </Card>

      <Card id="alerts" title="Concentration alert">
        <div className="field">
          <label htmlFor="conc">Flag any single position above</label>
          <div className="stepper">
            <input
              id="conc"
              type="range"
              min={2}
              max={50}
              step={1}
              value={state.settings.concentrationPct}
              onChange={(e) => dispatch({ type: "settings", patch: { concentrationPct: Number(e.target.value) } })}
            />
            <output htmlFor="conc">{state.settings.concentrationPct}%</output>
          </div>
        </div>
      </Card>

      <Card id="backup" title="Backup and move phones">
        <p>Your data lives only on this phone. Save a backup file to move it to a new phone or keep it safe.</p>
        <div className="form-actions">
          <button type="button" className="btn primary" onClick={exportBackup}>
            Export backup
          </button>
          <label className="btn ghost file-btn">
            Import backup
            <input ref={fileRef} type="file" accept="application/json,.json" onChange={(e) => importBackup(e.target.files?.[0])} />
          </label>
        </div>
        {msg && (
          <p className="hint" role="status">
            {msg}
          </p>
        )}
      </Card>

      <Card id="sample" title="Sample data">
        {state.sampleMode ? (
          <>
            <p>Sample accounts, calls, and watchlist are loaded. Your own entries are kept separately.</p>
            <button type="button" className="btn ghost" onClick={() => dispatch({ type: "clearSample" })}>
              Clear sample data
            </button>
          </>
        ) : (
          <button type="button" className="btn ghost" onClick={() => dispatch({ type: "loadSample" })}>
            Load sample data
          </button>
        )}
      </Card>

      <InstallTip always />

      <Card id="about" title="About">
        <p>
          <strong>No dollars, ever.</strong> Your accounts are shown only as percentages. Everything you enter stays in this
          browser on this phone. No logins, no account linking, no ads, no trackers.
        </p>
        <p>
          <strong>Not financial advice.</strong> This is a fan-made tracker for fun and learning. Prices can be delayed or
          wrong. Not affiliated with CNBC or Mad Money.
        </p>
        <p className="fine">Built for Marc. Market data from Yahoo Finance via a scheduled job.</p>
      </Card>

      <Card id="reset" title="Start over">
        <button
          type="button"
          className="btn danger"
          onClick={() => {
            if (window.confirm("Erase all accounts, calls, and settings from this phone? Export a backup first if you want to keep them.")) dispatch({ type: "reset" });
          }}
        >
          Erase everything
        </button>
      </Card>
    </>
  );
}
