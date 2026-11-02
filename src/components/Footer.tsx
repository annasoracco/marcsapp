import { useRef, useState } from "react";
import { useMarket } from "../lib/market";
import { backupText, parseBackup, useStore } from "../lib/store";
import { todayET } from "../lib/dates";

const asOfFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function isStandalone(): boolean {
  return (
    (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function Rules() {
  return (
    <section className="block rules" aria-labelledby="rules-h">
      <div className="block-head">
        <h2 id="rules-h">How it&rsquo;s scored</h2>
      </div>
      <dl className="rules-list">
        <div>
          <dt>The matchup</dt>
          <dd>Every stock Cramer covers on Mad Money. You confirm which way he called it, then make your own pick.</dd>
        </div>
        <div>
          <dt>Kickoff</dt>
          <dd>The first market close after you lock in. The final whistle is five trading days later.</dd>
        </div>
        <div>
          <dt>The win</dt>
          <dd>
            Bull wins if the stock beats the S&amp;P 500 over those five days. Bear wins if it trails. The S&amp;P 500 is
            measured with SPY, dividends included.
          </dd>
        </div>
        <div>
          <dt>Fair play</dt>
          <dd>
            Cramer is scored on the same five days as you, so nobody gets a head start. When you agree, you win or lose
            together. The race is decided by the calls where you split.
          </dd>
        </div>
        <div>
          <dt>The season</dt>
          <dd>Runs with the calendar year. Week 1 is the week of your first kickoff. Ties count as half a win.</dd>
        </div>
      </dl>
    </section>
  );
}

export function Footer() {
  const market = useMarket();
  const { state, dispatch } = useStore();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState<ReturnType<typeof parseBackup> | null>(null);

  const meta = market.status === "ready" ? market.data.meta : null;
  const save = () => {
    const blob = new Blob([backupText(state)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `marc-vs-cramer-backup-${todayET()}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMsg("Backup saved. Keep the file somewhere safe, like Files or iCloud Drive.");
  };

  return (
    <footer className="footer">
      <div className="footer-data">
        {meta && meta.source !== "sample" && (
          <p>
            Prices as of {asOfFmt.format(new Date(meta.quotesAsOf))} ET, refreshed about every 30 minutes while the
            market is open. Mad Money segments and their stock tags come from CNBC.
          </p>
        )}
        <p>
          Your picks and stocks are saved only on this phone. No login, no dollar amounts, and nothing is sent anywhere.
        </p>
        {!isStandalone() && (
          <p>To keep it one tap away, open it in Safari, tap Share, then Add to Home Screen.</p>
        )}
      </div>

      <section className="backup" aria-labelledby="backup-h">
        <p id="backup-h" className="backup-title">
          Switching phones?
        </p>
        <div className="backup-actions">
          <button type="button" className="ghost-btn" onClick={save}>
            Save a backup
          </button>
          <button type="button" className="ghost-btn" onClick={() => file.current?.click()}>
            Restore a backup
          </button>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                setPending(parseBackup(await f.text()));
                setMsg(null);
              } catch (err) {
                setPending(null);
                setMsg(err instanceof Error ? err.message : "That file couldn't be read.");
              }
            }}
          />
        </div>
        {pending && (
          <p className="backup-confirm">
            This backup has {Object.keys(pending.games).length} picks and {pending.owned.length} stocks. It replaces
            what&rsquo;s on this phone.{" "}
            <button
              type="button"
              className="text-btn inline"
              onClick={() => {
                dispatch({ type: "replace", state: pending });
                setPending(null);
                setMsg("Backup restored.");
              }}
            >
              Restore it
            </button>{" "}
            <button type="button" className="text-btn inline" onClick={() => setPending(null)}>
              Cancel
            </button>
          </p>
        )}
        {msg && (
          <p className="backup-msg" role="status">
            {msg}
          </p>
        )}
      </section>

      <p className="fine">
        For fun, not financial advice. Not affiliated with CNBC, Mad Money, or Jim Cramer. Prices can be delayed or
        wrong.
      </p>
    </footer>
  );
}
