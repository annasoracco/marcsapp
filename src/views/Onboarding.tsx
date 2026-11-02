import { Megaphone, ScanEye, ShieldCheck, Sunrise } from "lucide-react";
import { useStore } from "../lib/store";
import { BrandMark } from "../components/BrandMark";

export function Onboarding() {
  const { dispatch } = useStore();
  return (
    <main className="onboard" id="main">
      <div className="onboard-inner">
        <BrandMark size={64} title="Bird's Eye" />
        <h1 tabIndex={-1}>Bird's Eye</h1>
        <p className="onboard-tag">The market in plain English, Cramer's calls keeping score, and a look inside any fund.</p>
        <ul className="onboard-list">
          <li>
            <Sunrise size={22} aria-hidden="true" />
            <span>
              <strong>Daily briefing.</strong> What the market did, what moved it, and the big reports coming up.
            </span>
          </li>
          <li>
            <Megaphone size={22} aria-hidden="true" />
            <span>
              <strong>Cramer scorecard.</strong> Log a call in three taps and see if following him beats the S&amp;P.
            </span>
          </li>
          <li>
            <ScanEye size={22} aria-hidden="true" />
            <span>
              <strong>Fund X-ray.</strong> See what VOO, FXAIX, or any covered fund really holds, and compare them.
            </span>
          </li>
        </ul>
        <p className="privacy-note">
          <ShieldCheck size={18} aria-hidden="true" /> No accounts, no balances, no logins. It never asks about your money.
        </p>
        <div className="onboard-actions">
          <button type="button" className="btn primary block big" onClick={() => dispatch({ type: "onboard", sample: true })}>
            Explore with sample calls
          </button>
          <button type="button" className="btn quiet block big" onClick={() => dispatch({ type: "onboard", sample: false })}>
            Start fresh
          </button>
        </div>
        <p className="fine center">Not financial advice. Just a fan-made tracker.</p>
      </div>
    </main>
  );
}
