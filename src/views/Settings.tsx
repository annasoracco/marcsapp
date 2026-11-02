import { useRef, useState } from "react";
import { ChevronLeft, Download, ShieldCheck, Trash2, Upload } from "lucide-react";
import { useStore } from "../lib/store";
import { useMarket } from "../lib/market";
import { makeBackup, parseBackup } from "../lib/storage";
import { stamp } from "../lib/format";
import { todayET } from "../lib/dates";
import { navigate } from "../lib/route";
import { SectionHead } from "../components/bits";

export function Settings() {
  const { state, dispatch } = useStore();
  const ms = useMarket();
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState("");
  const [confirmErase, setConfirmErase] = useState(false);
  const meta = ms.status === "ready" ? ms.data.meta : undefined;

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(makeBackup(state), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `birdseye-backup-${todayET()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg("Backup saved. Keep it in Files or iCloud Drive to move to a new phone.");
  };

  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      const next = parseBackup(await file.text());
      if (window.confirm(`Replace what's on this phone with this backup (${next.calls.length} calls, ${next.watchlist.length} watched stocks)?`)) {
        dispatch({ type: "replace", state: next });
        setMsg("Backup restored.");
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="view settings">
      <button type="button" className="back-btn" onClick={() => (window.history.length > 1 ? window.history.back() : navigate("/briefing"))}>
        <ChevronLeft size={20} aria-hidden="true" /> Back
      </button>
      <h1 className="large-title" tabIndex={-1}>
        Settings
      </h1>

      <section className="privacy-card" aria-labelledby="priv-h">
        <ShieldCheck size={22} aria-hidden="true" />
        <div>
          <h2 id="priv-h">Your money stays private</h2>
          <p>Bird's Eye never asks for your accounts, balances, or holdings. It only keeps the Cramer calls you log and the stocks you watch, on this phone. No logins, no trackers.</p>
        </div>
      </section>

      <section aria-labelledby="data-h">
        <SectionHead id="data-h" title="Market data" />
        {meta ? (
          <ul className="facts">
            <li>Prices as of {stamp(meta.quotesAsOf)}.</li>
            <li>
              {meta.source === "live"
                ? "From Yahoo Finance, refreshed about every 30 minutes while the market is open."
                : meta.source === "cached"
                  ? "Showing the last good prices; the latest refresh didn't come through."
                  : "Sample prices: live data is temporarily unavailable."}
            </li>
            <li>{meta.counts.tickers} tickers covered: S&amp;P 500, MidCap 400, and SmallCap 600 stocks, the Nasdaq-100, the Dow, and popular ETFs and funds.</li>
          </ul>
        ) : (
          <p className="quiet-note">Loading…</p>
        )}
      </section>

      <section aria-labelledby="bk-h">
        <SectionHead id="bk-h" title="Backup" />
        <p className="lead">Saves your logged calls, watched stocks, and settings to a file so you can move to a new phone.</p>
        <div className="btn-row">
          <button type="button" className="btn primary" onClick={exportBackup}>
            <Download size={18} aria-hidden="true" /> Export backup
          </button>
          <label className="btn quiet file-btn">
            <Upload size={18} aria-hidden="true" /> Import backup
            <input ref={fileRef} type="file" accept="application/json,.json" onChange={(e) => importBackup(e.target.files?.[0])} />
          </label>
        </div>
        {msg && (
          <p className="fine" role="status">
            {msg}
          </p>
        )}
      </section>

      <section aria-labelledby="smp-h">
        <SectionHead id="smp-h" title="Sample data" />
        {state.sampleMode ? (
          <>
            <p className="lead">Made-up sample calls and watched stocks are loaded. Anything you added yourself is kept.</p>
            <button type="button" className="btn quiet" onClick={() => dispatch({ type: "clearSample" })}>
              Clear sample data
            </button>
          </>
        ) : (
          <button type="button" className="btn quiet" onClick={() => dispatch({ type: "loadSample" })}>
            Load sample calls and watchlist
          </button>
        )}
      </section>

      <section aria-labelledby="home-h">
        <SectionHead id="home-h" title="Add to Home Screen" />
        <ul className="facts">
          <li>
            <strong>iPhone (Safari):</strong> tap Share, then Add to Home Screen.
          </li>
          <li>
            <strong>Android (Chrome):</strong> tap the ⋮ menu, then Install app.
          </li>
        </ul>
      </section>

      <section aria-labelledby="about-h">
        <SectionHead id="about-h" title="About" />
        <p className="lead">
          <strong>Not financial advice.</strong> Bird's Eye is a fan-made tracker for fun and learning. Prices can be delayed or wrong. It isn't affiliated with CNBC, Mad Money, or any team.
        </p>
        <p className="fine">Built for Marc. Market data from Yahoo Finance; headlines from CNBC's Mad Money RSS feed.</p>
      </section>

      <section aria-labelledby="erase-h">
        <SectionHead id="erase-h" title="Start over" />
        <button
          type="button"
          className={`btn ${confirmErase ? "danger" : "quiet"}`}
          onClick={() => {
            if (!confirmErase) return setConfirmErase(true);
            dispatch({ type: "reset" });
            setConfirmErase(false);
            setMsg("Everything was erased from this phone.");
          }}
        >
          <Trash2 size={18} aria-hidden="true" /> {confirmErase ? "Tap again to erase everything" : "Erase calls and watchlist"}
        </button>
      </section>
    </div>
  );
}
