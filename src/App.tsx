import { useEffect, useRef } from "react";
import { useStore } from "./lib/store";
import { useMarket } from "./lib/market";
import { useRoute } from "./lib/route";
import { stamp } from "./lib/format";
import { Onboarding } from "./views/Onboarding";
import { CallsView } from "./views/CallsView";
import { XrayView } from "./views/XrayView";
import { AccountEdit } from "./views/AccountEdit";
import { TodayView } from "./views/TodayView";
import { EarningsView } from "./views/EarningsView";
import { MoreView } from "./views/MoreView";
import { TickerView } from "./views/TickerView";
import { InstallTip } from "./components/InstallTip";

const TABS = [
  { id: "calls", label: "Calls", icon: "M4 18h3V9H4v9Zm6.5 0h3V5h-3v13Zm6.5 0h3v-6h-3v6Z" },
  { id: "xray", label: "X-ray", icon: "M12 3a9 9 0 1 0 9 9h-9V3Zm2 0v7h7a9 9 0 0 0-7-7Z" },
  { id: "today", label: "Today", icon: "M3 17l5-5 4 4 8-8v4h2V4h-8v2h4l-6 6-4-4-7 7 2 2Z" },
  { id: "earnings", label: "Earnings", icon: "M7 2v2H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7Zm-2 7h14v10H5V9Z" },
  { id: "more", label: "More", icon: "M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" },
];

function Header() {
  const ms = useMarket();
  const meta = ms.status === "ready" ? ms.data.meta : undefined;
  return (
    <header className="top">
      <a className="brand" href="#/calls">
        <span className="brand-mark" aria-hidden="true" />
        Marc’s App
      </a>
      <span className="asof" aria-live="polite">
        {meta ? `Prices as of ${stamp(meta.quotesAsOf)}` : ms.status === "error" ? "Prices unavailable" : "Loading prices…"}
      </span>
    </header>
  );
}

function Banners() {
  const { state, dispatch } = useStore();
  const ms = useMarket();
  return (
    <>
      {ms.status === "error" && (
        <p className="banner bad" role="alert">
          Can’t load market data right now. Check your connection and pull to refresh.
        </p>
      )}
      {ms.status === "ready" && ms.data.meta.source === "sample" && (
        <p className="banner warn" role="status">
          Sample market data: live prices are temporarily unavailable, so the numbers below are made up.
        </p>
      )}
      {ms.status === "ready" && ms.data.meta.source === "cached" && (
        <p className="banner" role="status">
          Showing the last good prices; the latest refresh didn’t come through.
        </p>
      )}
      {state.sampleMode && (
        <div className="banner sample" role="status">
          <span>You’re exploring sample accounts and calls (all made up).</span>
          <button type="button" className="btn ghost small" onClick={() => dispatch({ type: "clearSample" })}>
            Clear sample data
          </button>
        </div>
      )}
    </>
  );
}

export function App() {
  const { state } = useStore();
  const route = useRoute();
  const mainRef = useRef<HTMLElement>(null);
  const tab = route[0] === "t" ? "" : (route[0] ?? "calls");
  const routeKey = route.join("/");

  useEffect(() => {
    window.scrollTo(0, 0);
    const h1 = mainRef.current?.querySelector<HTMLElement>("h1");
    if (h1 && routeKey) h1.focus({ preventScroll: true });
  }, [routeKey]);

  if (!state.onboarded) return <Onboarding />;

  let view;
  switch (route[0]) {
    case "xray":
      view = route[1] === "account" && route[2] ? <AccountEdit key={route[2]} id={route[2]} /> : <XrayView />;
      break;
    case "today":
      view = <TodayView />;
      break;
    case "earnings":
      view = <EarningsView />;
      break;
    case "more":
      view = <MoreView />;
      break;
    case "t":
      view = route[1] ? <TickerView key={route[1]} symbol={route[1]} /> : <CallsView />;
      break;
    case "calls":
      view = <CallsView key={routeKey} prefill={route[1] === "new" ? route[2] : undefined} />;
      break;
    default:
      view = <CallsView />;
  }

  return (
    <div className="shell">
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.querySelector<HTMLElement>("h1")?.focus(); }}>
        Skip to content
      </a>
      <Header />
      <main id="main" ref={mainRef}>
        <Banners />
        {(tab === "calls" || tab === "") && route[0] !== "t" && <InstallTip />}
        {view}
        <p className="disclaimer">Not financial advice. Percentages only; your data stays on this phone.</p>
      </main>
      <nav className="tabs" aria-label="Main">
        {TABS.map((t) => (
          <a key={t.id} href={`#/${t.id}`} aria-current={tab === t.id || (t.id === "calls" && tab === "") ? "page" : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={t.icon} />
            </svg>
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
