import { useStore } from "../lib/store";

export function Onboarding() {
  const { dispatch } = useStore();
  return (
    <main className="onboard" id="main">
      <div className="onboard-card">
        <p className="eyebrow">Built for Marc</p>
        <h1 tabIndex={-1}>Your market desk, minus the dollar signs</h1>
        <ul className="onboard-list">
          <li>
            <strong>Cramer Call Tracker.</strong> Log a call in seconds and see if it beat the S&amp;P 500, plus the Inverse
            Cramer score.
          </li>
          <li>
            <strong>Account X-ray.</strong> All your accounts as one portfolio: overlap, concentration, sectors, and what
            your funds really own.
          </li>
          <li>
            <strong>Today and Earnings.</strong> Sector heat map, your movers, and who reports next.
          </li>
        </ul>
        <p className="privacy">
          Percentages only. Nothing you enter leaves this phone: no logins, no linking, no trackers.
        </p>
        <div className="onboard-actions">
          <button type="button" className="btn primary big" onClick={() => dispatch({ type: "onboard", sample: true })}>
            Explore with sample accounts
          </button>
          <button type="button" className="btn ghost big" onClick={() => dispatch({ type: "onboard", sample: false })}>
            Start fresh
          </button>
        </div>
        <p className="fine">Not financial advice. Just a fan-made tracker.</p>
      </div>
    </main>
  );
}
