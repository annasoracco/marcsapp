import { useEffect, useMemo } from "react";
import { useHistories, useMarket } from "./market";
import { useStore } from "./store";
import { fromRecent, withQuote } from "./history";
import type { Series } from "./marketTypes";
import { BENCH, type Calendar, type FinalGame, type Game, type GameState, evaluate, makeCalendar } from "./game";

export interface Evaluated {
  game: Game;
  state: GameState;
}

export interface GamesView {
  all: Evaluated[];
  /** kicked off or waiting to kick off */
  inPlay: Evaluated[];
  finals: FinalGame[];
  calendar: Calendar | null | undefined;
  /** false when prices are sample data */
  scoring: boolean;
}

export function useGames(): GamesView {
  const market = useMarket();
  const { state, dispatch } = useStore();
  const games = useMemo(() => Object.values(state.games), [state.games]);
  const ready = market.status === "ready" ? market.data : null;
  const scoring = !ready || ready.meta.source !== "sample";

  // Prices for picked stocks come from the shared recent-closes file whenever it covers the kickoff, so
  // the app never requests a file named after one of Marc's picks. Older matchups fall back to the
  // stock's own history file.
  const fromShared = useMemo(() => {
    const m = new Map<string, Series>();
    if (!ready || !scoring) return m;
    for (const g of games) {
      if (g.fin || m.has(g.s)) continue;
      const s = fromRecent(ready.recent, g.s);
      if (s && s.dates[0] <= g.kick) m.set(g.s, withQuote(s, ready.market.t[g.s]));
    }
    return m;
  }, [ready, scoring, games]);

  const symbols = useMemo(
    () =>
      ready && scoring
        ? [BENCH, ...games.filter((g) => !g.fin && !fromShared.has(g.s) && ready.market.t[g.s]).map((g) => g.s)]
        : [],
    [ready, scoring, games, fromShared],
  );
  const histories = useHistories(symbols);
  const spy = histories[BENCH];

  const calendar = useMemo<Calendar | null | undefined>(() => {
    if (!ready) return undefined;
    if (spy === undefined) return undefined;
    if (spy === null) return null;
    return makeCalendar(spy, ready.market.t[BENCH]);
  }, [ready, spy]);

  const all = useMemo<Evaluated[]>(
    () =>
      games.map((game) => {
        if (!game.fin && !scoring) return { game, state: { kind: "paused" } };
        const quote = ready?.market.t[game.s];
        const stock = ready && !game.fin && !quote ? null : (fromShared.get(game.s) ?? histories[game.s]);
        return { game, state: evaluate(game, calendar, stock, quote) };
      }),
    [games, scoring, ready, histories, fromShared, calendar],
  );

  // Save results as they go final so the season survives after old price files roll off.
  useEffect(() => {
    for (const { game, state: s } of all) {
      if (s.kind === "final" && !game.fin) dispatch({ type: "settle", id: game.id, fin: s.fin });
    }
  }, [all, dispatch]);

  return useMemo(() => {
    const inPlay = all
      .filter((e) => e.state.kind !== "final")
      .sort((a, b) => a.game.kick.localeCompare(b.game.kick) || a.game.s.localeCompare(b.game.s));
    const finals = all
      .filter((e) => e.state.kind === "final")
      .map((e) => ({ ...e.game, fin: (e.state as { kind: "final"; fin: FinalGame["fin"] }).fin }));
    return { all, inPlay, finals, calendar, scoring };
  }, [all, calendar, scoring]);
}
