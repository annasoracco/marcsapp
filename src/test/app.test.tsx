import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { STORAGE_KEY } from "../lib/store";
import { makeSynthetic } from "./synthetic";

const syn = makeSynthetic();

function mockFetch() {
  const calls: string[] = [];
  const fn = vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    calls.push(u);
    const body = u.endsWith("hindsight-more.json") ? { v: 3, generatedAt: syn.raw.generatedAt, t: syn.more } : syn.raw;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ symbol: "UP", start: { kind: "month", m: (2007 - 1988) * 12 }, amount: 30000, real: false, saved: [] }));
});
afterEach(() => vi.unstubAllGlobals());

describe("App", () => {
  it("loads both data shards once, up front, and shows the scenario", async () => {
    const calls = mockFetch();
    render(<App />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/If you’d put \$30,000 into Upward Co in Jan 2007, you’d have/);
    await screen.findByText(/The S&P 500 would have made it/);
    expect(calls.map((c) => c.replace(/^.*\/data\//, ""))).toEqual(["hindsight.json", "hindsight-more.json"]);
  });

  it("never touches the network or the URL while Marc types or picks", async () => {
    const calls = mockFetch();
    const href = location.href;
    render(<App />);
    await screen.findByRole("heading", { level: 1 });
    const before = calls.length;

    fireEvent.click(screen.getByRole("button", { name: /^Investment,/ }));
    const search = await screen.findByRole("searchbox");
    fireEvent.change(search, { target: { value: "coin" } });
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: /Coin/ }));

    fireEvent.click(screen.getByRole("button", { name: /^Amount,/ }));
    const amount = within(screen.getByRole("dialog")).getByRole("textbox");
    fireEvent.change(amount, { target: { value: "12345" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Use \$12,345/ }));

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(/\$12,345 into Coin/);
    expect(calls.length).toBe(before);
    expect(location.href).toBe(href);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toMatchObject({ symbol: "BTC", amount: 12345 });
  });

  it("moves the start date with the slider's keyboard controls", async () => {
    mockFetch();
    render(<App />);
    const slider = await screen.findByRole("slider", { name: "Start date" });
    await act(async () => {
      fireEvent.keyDown(slider, { key: "PageUp" });
    });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/in Jan 2008/);
  });

  it("plays the drawdown game", async () => {
    mockFetch();
    render(<App />);
    await screen.findByRole("heading", { name: "Would you have held?" });
    fireEvent.click(screen.getByRole("button", { name: "Show me how far it fell" }));
    expect(await screen.findByText(/from its high/)).toBeInTheDocument();
    expect(screen.getByText(/You guessed/)).toBeInTheDocument();
  });

  it("shows a calm message when prices can't load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 404 })));
    render(<App />);
    expect(await screen.findByText("Prices are updating")).toBeInTheDocument();
  });
});
