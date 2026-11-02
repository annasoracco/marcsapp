import { useEffect, useMemo, useState } from "react";
import { useHistories, useMarket } from "../lib/market";
import { useStore } from "../lib/store";
import { useGames } from "../lib/useGames";
import { buildSlate, slateIndex, type SlateStock } from "../lib/slate";
import { BENCH, type Game, type Side, byFinish, gameId, isBeforeKickoff, kickoffDate, seasonOf, standings, weekNumber } from "../lib/game";
import { closeLabel, todayET } from "../lib/dates";
import { indexOnOrBefore } from "../lib/history";
import { StandingsTable } from "../components/StandingsTable";
import { Board } from "../components/Board";
import { GameDetail, GameRow } from "../components/GameRow";
import { PickSlip } from "../components/PickSlip";
import { OwnedStocks } from "../components/OwnedStocks";
import { Rules } from "../components/Footer";

export function seasonContext(season: number, kicks: string[], today: string): string {
  const inSeason = kicks.filter((k) => seasonOf(k) === season).sort();
  if (!inSeason.length) return `${season} season`;
  return `${season} season, Week ${Math.max(1, weekNumber(inSeason[0], today))}`;
}

export function Home({ now }: { now: Date }) {
  const market = useMarket();
  const { state, dispatch } = useStore();
  const g = useGames();
  const today = todayET(now);
  const season = Number(today.slice(0, 4));
  const ready = market.status === "ready" ? market.data : null;

  const nights = useMemo(() => (ready ? buildSlate(ready.news, ready.market) : []), [ready]);
  const slate = useMemo(() => slateIndex(nights), [nights]);
  const spy = useHistories(ready ? [BENCH] : [])[BENCH];
  const benchSince = (air: string): number | null => {
    if (!spy) return null;
    const i = indexOnOrBefore(spy, air);
    if (i < 0 || i === spy.closes.length - 1) return null;
    return spy.closes[spy.closes.length - 1] / spy.closes[i] - 1;
  };

  const seasonFinals = g.finals.filter((f) => seasonOf(f.fin.k) === season);
  const st = standings(seasonFinals);
  const kicks = g.all.map((e) => (e.state.kind === "final" ? e.state.fin.k : e.game.kick));
  const context = seasonContext(season, kicks, today);
  const recent = [...seasonFinals].sort(byFinish).reverse().slice(0, 5);

  const [openGame, setOpenGame] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const owned = useMemo(() => new Set(state.owned), [state.owned]);
  const picked = useMemo(() => new Set(Object.keys(state.games)), [state.games]);
  const hidden = useMemo(() => new Set(state.hidden), [state.hidden]);
  const toggleOwn = (s: string) => dispatch({ type: "own", s, on: !owned.has(s) });

  const lock = (stock: Pick<SlateStock, "s" | "n" | "air" | "title" | "link">, cramer: Side, marc: Side) => {
    const at = new Date();
    const game: Game = {
      id: gameId(stock.air, stock.s),
      s: stock.s,
      n: stock.n,
      air: stock.air,
      title: stock.title,
      link: stock.link,
      cramer,
      marc,
      at: at.toISOString(),
      kick: kickoffDate(at),
    };
    dispatch({ type: "pick", game });
    setOpenGame(null);
    setToast(`${stock.s} is locked in. Kicks off at ${closeLabel(game.kick, todayET(at))}.`);
  };

  const toggleGame = (id: string) => {
    setConfirming(null);
    setOpenGame((cur) => (cur === id ? null : id));
  };
  const remove = (id: string) => {
    dispatch({ type: "remove", id });
    setOpenGame(null);
    setConfirming(null);
  };

  return (
    <>
      <StandingsTable st={st} context={context} />
      {g.all.length === 0 && (
        <button
          type="button"
          className="text-btn jump"
          onClick={() => document.getElementById("rules-h")?.scrollIntoView({ behavior: "smooth", block: "start" })}
        >
          How it&rsquo;s scored
        </button>
      )}

      {ready?.meta.source === "sample" && (
        <p className="notice" role="status">
          Live prices aren&rsquo;t available right now, so nothing is being scored. Your picks are safe and will score
          once real prices come back.
        </p>
      )}
      {market.status === "error" && (
        <p className="notice" role="status">
          Can&rsquo;t reach the market data right now. Your picks are safe on this phone.{" "}
          <button type="button" className="text-btn inline" onClick={() => window.location.reload()}>
            Try again
          </button>
        </p>
      )}

      {g.inPlay.length > 0 && (
        <section className="block" aria-labelledby="inplay-h">
          <div className="block-head">
            <h2 id="inplay-h">In play</h2>
            <span className="block-count">{g.inPlay.length}</span>
          </div>
          <ul className="list">
            {g.inPlay.map(({ game, state: gs }) => (
              <GameRow key={game.id} game={game} state={gs} today={today} open={openGame === game.id} onToggle={() => toggleGame(game.id)}>
                {gs.kind === "pending" && isBeforeKickoff(game, now) ? (
                  <PickSlip
                    stock={{
                      id: game.id,
                      s: game.s,
                      n: game.n,
                      air: game.air,
                      title: game.title,
                      link: game.link,
                      playable: true,
                      since: slate.get(game.id)?.since,
                    }}
                    owned={owned.has(game.s)}
                    benchSince={benchSince(game.air)}
                    initial={{ cramer: game.cramer, marc: game.marc }}
                    now={now}
                    onLock={(c, m) => lock(game, c, m)}
                    onToggleOwn={() => toggleOwn(game.s)}
                    onRemove={() => remove(game.id)}
                  />
                ) : (
                  <GameDetail
                    game={game}
                    state={gs}
                    confirming={confirming === game.id}
                    onConfirm={() => setConfirming(game.id)}
                    onRemove={() => remove(game.id)}
                  />
                )}
              </GameRow>
            ))}
          </ul>
        </section>
      )}

      {market.status === "loading" ? (
        <section className="block" aria-labelledby="board-h" aria-busy="true">
          <div className="block-head">
            <h2 id="board-h">This week&rsquo;s board</h2>
          </div>
          <p className="block-sub">Loading the latest Mad Money shows&hellip;</p>
        </section>
      ) : (
        <Board
          nights={nights}
          picked={picked}
          hidden={hidden}
          owned={owned}
          now={now}
          benchSince={benchSince}
          onLock={lock}
          onHide={(id) => dispatch({ type: "hide", id })}
          onUnhideAll={() => dispatch({ type: "unhideAll" })}
          onToggleOwn={toggleOwn}
        />
      )}

      {recent.length > 0 && (
        <section className="block" aria-labelledby="final-h">
          <div className="block-head">
            <h2 id="final-h">Final</h2>
            <a className="block-link" href="#/season">
              Full season
            </a>
          </div>
          <ul className="list">
            {recent.map((game) => (
              <GameRow
                key={game.id}
                game={game}
                state={{ kind: "final", fin: game.fin }}
                today={today}
                open={openGame === game.id}
                onToggle={() => toggleGame(game.id)}
              >
                <GameDetail
                  game={game}
                  state={{ kind: "final", fin: game.fin }}
                  confirming={confirming === game.id}
                  onConfirm={() => setConfirming(game.id)}
                  onRemove={() => remove(game.id)}
                />
              </GameRow>
            ))}
          </ul>
        </section>
      )}

      <OwnedStocks
        owned={state.owned}
        market={ready?.market}
        onToggle={(s, on) => dispatch({ type: "own", s, on })}
      />
      <Rules />

      <div className="toast-dock" aria-live="polite">
        {toast && (
          <p className="toast" role="status">
            {toast}
          </p>
        )}
      </div>
    </>
  );
}
