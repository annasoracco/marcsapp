import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => cleanup());

// jsdom lacks a few browser APIs the app relies on.
class RO {
  constructor(private cb: ResizeObserverCallback) {}
  observe(el: Element) {
    this.cb([{ contentRect: { width: 350, height: 200 } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
    void el;
  }
  unobserve() {}
  disconnect() {}
}

if (typeof window !== "undefined") {
  if (!("ResizeObserver" in window)) (window as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: query.includes("reduce"),
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
  window.scrollTo = (() => {}) as typeof window.scrollTo;
  Element.prototype.scrollIntoView = function () {};
  Element.prototype.scrollTo = function () {} as typeof Element.prototype.scrollTo;
}
