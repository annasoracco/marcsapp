import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { StoreProvider } from "./lib/store";
import { MarketProvider } from "./lib/market";
import { UiProvider } from "./components/Sheet";
import { App } from "./App";
import "./styles.css";

registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <MarketProvider>
        <UiProvider>
          <App />
        </UiProvider>
      </MarketProvider>
    </StoreProvider>
  </StrictMode>,
);
