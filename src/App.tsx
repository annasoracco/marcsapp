import { useEffect, useRef } from "react";
import { ChartCandlestick, Megaphone, ScanEye, Settings as SettingsIcon, Sunrise, X } from "lucide-react";
import { useStore } from "./lib/store";
import { useMarket } from "./lib/market";
import { useRoute } from "./lib/route";
import { BrandMark } from "./components/BrandMark";
import { Sheet, useUi } from "./components/Sheet";
import { Onboarding } from "./views/Onboarding";
import { Briefing } from "./views/Briefing";
import { Cramer } from "./views/Cramer";
import { Funds } from "./views/Funds";
import { Markets } from "./views/Markets";
import { Ticker } from "./views/Ticker";
import { Settings } from "./views/Settings";
import { AddCallSheet, CallSheet, ExplainSheet } from "./views/CallSheets";

const TABS = [
  { id: "briefing", label: "Briefing", Icon: Sunrise },
  { id: "cramer", label: "Cramer", Icon: Megaphone },
  { id: "funds", label: "Fund X-ray", Icon: ScanEye },
  { id: "markets", label: "Markets", Icon: ChartCandlestick },
] as const;

/** Old routes from earlier versions keep working. */
const ALIASES: Record<string, string> = { "": "briefing", calls: "cramer", today: "markets", earnings: "markets", xray: "funds", more: "settings" };

function Header() {
  const { state } = useStore();
  const { open } = useUi();
  const ms = useMarket();
  const source = ms.status === "ready" ? ms.data.meta.source : undefined;
  return (
    <header className="top">
      <a className="brand" href="#/briefing" aria-label="Bird's Eye, go to Briefing">
        <BrandMark size={28} />
        <span className="brand-name">Bird's Eye</span>
      </a>
      <div className="top-actions">
        {source === "sample" && (
          <span className="status-pill static">
            <span className="pill-face warn">Sample prices</span>
          </span>
        )}
        {state.sampleMode && (
          <button type="button" className="status-pill" onClick={() => open({ kind: "sample" })} aria-label="Sample data is on. Tap to clear it.">
            <span className="pill-face">
              Sample data <X size={12} aria-hidden="true" />
            </span>
          </button>
        )}
        <a className="icon-btn" href="#/settings" aria-label="Settings">
          <SettingsIcon size={21} aria-hidden="true" />
        </a>
      </div>
    </header>
  );
}

function SheetHost() {
  const { sheet, close } = useUi();
  const { dispatch } = useStore();
  if (!sheet) return null;
  switch (sheet.kind) {
    case "addCall":
      return <AddCallSheet key={JSON.stringify(sheet)} {...sheet} />;
    case "call":
      return <CallSheet key={sheet.id} id={sheet.id} />;
    case "explain":
      return <ExplainSheet key={sheet.term} term={sheet.term} />;
    case "sample":
      return (
        <Sheet title="Clear sample data?" onClose={close}>
          <p className="lead">This removes the made-up calls and watched stocks. Anything you added yourself stays.</p>
          <button
            type="button"
            className="btn primary block"
            data-autofocus=""
            onClick={() => {
              dispatch({ type: "clearSample" });
              close();
            }}
          >
            Clear sample data
          </button>
        </Sheet>
      );
    case "install":
      return (
        <Sheet title="Add to your Home Screen" onClose={close}>
          <ul className="facts">
            <li>
              <strong>iPhone (Safari):</strong> tap the Share button, then Add to Home Screen.
            </li>
            <li>
              <strong>Android (Chrome):</strong> tap the ⋮ menu, then Install app.
            </li>
          </ul>
          <p className="lead">Bird's Eye then opens full screen like any app, and works offline with the last prices it saw.</p>
          <button type="button" className="btn primary block" onClick={close} data-autofocus="">
            Got it
          </button>
        </Sheet>
      );
  }
}

export function App() {
  const { state } = useStore();
  const raw = useRoute();
  const route = raw.length === 0 || ALIASES[raw[0]] !== undefined ? [ALIASES[raw[0] ?? ""] ?? raw[0], ...raw.slice(1)] : raw;
  const mainRef = useRef<HTMLElement>(null);
  const routeKey = route.join("/");
  const tab = route[0];

  useEffect(() => {
    if (route[0] === "markets" && route[1] === "earnings") {
      requestAnimationFrame(() => document.getElementById("earnings-section")?.scrollIntoView({ block: "start" }));
      return;
    }
    window.scrollTo(0, 0);
    if (raw.length) mainRef.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  if (!state.onboarded) return <Onboarding />;

  let view;
  switch (tab) {
    case "cramer":
      view = <Cramer />;
      break;
    case "funds":
      view = <Funds route={route} />;
      break;
    case "markets":
      view = <Markets />;
      break;
    case "settings":
      view = <Settings />;
      break;
    case "t":
      view = route[1] ? <Ticker key={route[1]} symbol={route[1]} /> : <Markets />;
      break;
    default:
      view = <Briefing />;
  }

  return (
    <div className="shell">
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.querySelector<HTMLElement>("h1")?.focus(); }}>
        Skip to content
      </a>
      <Header />
      <main id="main" ref={mainRef} key={tab === "funds" ? "funds" : routeKey}>
        {view}
      </main>
      <nav className="tabs" aria-label="Main">
        {TABS.map(({ id, label, Icon }) => {
          const active = tab === id || (id === "markets" && tab === "t");
          return (
            <a key={id} href={`#/${id}`} aria-current={active ? "page" : undefined}>
              <span className="tab-icon">
                <Icon size={22} aria-hidden="true" strokeWidth={active ? 2.25 : 1.75} />
              </span>
              <span className="tab-label">{label}</span>
            </a>
          );
        })}
      </nav>
      <SheetHost />
    </div>
  );
}
