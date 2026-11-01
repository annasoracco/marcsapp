import { useStore } from "../lib/store";

function isStandalone(): boolean {
  return (
    (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** One-time "add to home screen" tip. `always` shows it (without dismiss) on the More screen. */
export function InstallTip({ always }: { always?: boolean }) {
  const { state, dispatch } = useStore();
  if (!always && (state.settings.installTipDismissed || isStandalone())) return null;
  return (
    <aside className="card tip" aria-labelledby="tip-h">
      <h2 id="tip-h">Put it on your home screen</h2>
      <ul className="plain">
        <li>
          <strong>iPhone (Safari):</strong> tap Share, then “Add to Home Screen”.
        </li>
        <li>
          <strong>Android (Chrome):</strong> tap the ⋮ menu, then “Install app”.
        </li>
      </ul>
      {!always && (
        <button type="button" className="btn ghost small" onClick={() => dispatch({ type: "settings", patch: { installTipDismissed: true } })}>
          Got it
        </button>
      )}
    </aside>
  );
}
