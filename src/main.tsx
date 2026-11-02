import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "@fontsource-variable/public-sans/wght.css";
import { StoreProvider } from "./lib/store";
import { MarketProvider } from "./lib/market";
import { App } from "./App";
import "./styles.css";

registerSW({ immediate: true });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <MarketProvider>
        <App />
      </MarketProvider>
    </StoreProvider>
  </StrictMode>,
);