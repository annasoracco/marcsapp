import { useEffect, useState } from "react";

/** Hash routes work on GitHub Pages without server rewrites: #/calls, #/xray, #/t/AAPL ... */
export function parseHash(hash: string): string[] {
  return hash
    .replace(/^#\/?/, "")
    .split("/")
    .filter(Boolean)
    .map((p) => decodeURIComponent(p));
}

export function useRoute(): string[] {
  const [parts, setParts] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const on = () => setParts(parseHash(window.location.hash));
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return parts;
}

export function navigate(to: string): void {
  window.location.hash = to.startsWith("#") ? to : `#${to}`;
}

export const tickerHref = (symbol: string) => `#/t/${encodeURIComponent(symbol)}`;
