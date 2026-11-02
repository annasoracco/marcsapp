import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { MarketProvider } from "../lib/market";
import { STORAGE_KEY, StoreProvider, type SavedState } from "../lib/store";
import { fixtureSource } from "./fixtures";

const NOW = new Date("2026-10-31T12:00:00-04:00");

function renderApp(initial?: SavedState, kind: "live" | "sample" = "live", source = fixtureSource(kind)) {
  return render(
    <StoreProvider initial={initial}>
      <MarketProvider source={source}>
        <App now={NOW} />
      </MarketProvider>
    </StoreProvider>,
  );
}

const finished: SavedState = {
  games: {
    "2026-10-13|ESI": {
      id: "2026-10-13|ESI",
      s: "ESI",
      n: "Element Solutions",
      air: "2026-10-13",
      title: "Cramer's lightning round: 'Hold on to Element Solutions'",
      link: "https://www.cnbc.com/2026/10/13/x.html",
      cramer: "bull",
      marc: "bear",
      at: "2026-10-14T03:00:00.000Z",
      kick: "2026-10-14",
      fin: { k: "2026-10-14", e: "2026-10-21", sr: -0.05, br: 0.01 },
    },
  },
  hidden: [],
  owned: ["MSFT"],
};

describe("Marc vs. Cramer", () => {
  it("starts at 0–0 with a board of matchups and never shows a dollar amount", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    renderApp();
    const table = await screen.findByRole("table", { name: /Standings/ });
    expect(within(table).getByRole("row", { name: /Marc/ })).toHaveTextContent("0\u20130");
    expect(await screen.findByRole("button", { name: /KMB/ })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\$\s?\d/);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("confirms Cramer's call, locks Marc's pick, and saves it only on the phone", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("button", { name: /KMB/ }));
    expect(screen.getByText(/The headline reads Bull/)).toBeInTheDocument();
    const lock = screen.getByRole("button", { name: "Lock it in" });
    expect(lock).toBeDisabled();
    await user.click(within(screen.getByRole("group", { name: "Cramer's call" })).getByLabelText(/Bull/));
    await user.click(within(screen.getByRole("group", { name: "Your pick" })).getByLabelText(/Bear/));
    expect(screen.getByText(/You're going against Cramer/)).toBeInTheDocument();
    await user.click(lock);
    expect(await screen.findByText(/KMB is locked in/)).toBeInTheDocument();
    const inPlay = screen.getByRole("region", { name: "In play" });
    expect(within(inPlay).getByText("KMB")).toBeInTheDocument();
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(saved.games["2026-10-29|KMB"]).toMatchObject({ cramer: "bull", marc: "bear" });
  });

  it("never scores a stock until Marc confirms Cramer's side", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole("button", { name: /KMB/ }));
    await user.click(within(screen.getByRole("group", { name: "Your pick" })).getByLabelText(/Bull/));
    expect(screen.getByRole("button", { name: "Lock it in" })).toBeDisabled();
  });

  it("puts stocks Marc owns at the top of the board", async () => {
    renderApp({ games: {}, hidden: [], owned: ["AMC"] });
    const yours = await screen.findByRole("region", { name: "Cramer talked about your stocks" });
    expect(within(yours).getByText("AMC")).toBeInTheDocument();
  });

  it("shows the season record from saved finals", async () => {
    window.location.hash = "#/season";
    renderApp(finished);
    const table = await screen.findByRole("table", { name: /Standings/ });
    expect(within(table).getByRole("row", { name: /Marc/ })).toHaveTextContent("1\u20130");
    expect(within(table).getByRole("row", { name: /Cramer/ })).toHaveTextContent("0\u20131");
    expect(screen.getByText(/You lead by 1 game/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/\$\s?\d/);
  });

  it("pauses scoring when prices are sample data, and shows no prices", async () => {
    renderApp(finished, "sample");
    expect(await screen.findByText(/nothing is being scored/)).toBeInTheDocument();
    expect(screen.getByText("Live prices are unavailable right now.")).toBeInTheDocument();
    expect(screen.queryByText(/Prices as of/)).not.toBeInTheDocument();
  });

  it("scores a live matchup without ever requesting a file named after Marc's pick", async () => {
    const source = fixtureSource();
    const loadHistory = vi.spyOn(source, "loadHistory");
    const live: SavedState = {
      games: {
        "2026-10-23|AVGO": {
          id: "2026-10-23|AVGO",
          s: "AVGO",
          n: "Broadcom",
          air: "2026-10-23",
          title: "t",
          link: "https://www.cnbc.com/x.html",
          cramer: "bull",
          marc: "bear",
          at: "2026-10-26T13:00:00.000Z",
          kick: "2026-10-26",
        },
      },
      hidden: [],
      owned: [],
    };
    renderApp(live, "live", source);
    const inPlay = await screen.findByRole("region", { name: "In play" });
    expect(await within(inPlay).findByText(/Day 4 of 5/)).toBeInTheDocument();
    expect(within(inPlay).getByText(/Behind/)).toBeInTheDocument();
    expect(loadHistory.mock.calls.map(([s]) => s)).toEqual(["SPY"]);
  });
});
