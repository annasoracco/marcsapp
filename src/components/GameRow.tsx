import type { ReactNode } from "react";
import { type Game, type GameState, GAME_DAYS, leadingSide, resultFor } from "../lib/game";
import { pct, pts } from "../lib/format";
import { closeLabel, monthDayLabel } from "../lib/dates";
import { Chevron, ResultMark, SideMark } from "./bits";

function summary(game: Game, state: GameState, today: string): { sub: ReactNode; end: ReactNode } {
  switch (state.kind) {
    case "pending":
      return { sub: `Kicks off at ${closeLabel(state.kick, today)}`, end: null };
    case "live": {
      const lead = leadingSide(state.sr, state.br);
      const ahead = lead === game.marc;
      const margin = state.sr - state.br;
      if (state.day === 0) return { sub: `Kicked off at the ${monthDayLabel(state.kick)} close`, end: null };
      return {
        sub: (
          <>
            Since kickoff: {pct(state.sr)} vs. S&amp;P {pct(state.br)}
          </>
        ),
        end: (
          <span className="end-stack">
            {lead ? (
              <span className={`end-live ${ahead ? "is-ahead" : "is-behind"}`} aria-label={`You're ${ahead ? "ahead" : "behind"} by ${pts(margin)}`}>
                {ahead ? "Ahead" : "Behind"} {pts(margin).replace(/\s+pts?$/, "")}
              </span>
            ) : (
              <span className="end-note">Even</span>
            )}
            <span className="end-day">
              Day {state.day} of {GAME_DAYS}
            </span>
          </span>
        ),
      };
    }
    case "final": {
      const mine = resultFor(game.marc, state.fin.sr, state.fin.br);
      const his = resultFor(game.cramer, state.fin.sr, state.fin.br);
      const word = { W: "win", L: "loss", T: "tie" } as const;
      return {
        sub: (
          <>
            Final {monthDayLabel(state.fin.e)} &middot; {pct(state.fin.sr)} vs. S&amp;P {pct(state.fin.br)}
          </>
        ),
        end: (
          <span className="end-stack">
            <ResultMark r={mine} label={`Your result: ${word[mine]}`} />
            {game.marc !== game.cramer && <span className="end-day">Cramer {his}</span>}
          </span>
        ),
      };
    }
    case "nodata":
      return { sub: `No prices for ${game.s} right now`, end: null };
    case "paused":
      return { sub: "Waiting for live prices", end: null };
    default:
      return { sub: "Loading prices\u2026", end: null };
  }
}

export function GameRow({
  game,
  state,
  today,
  open,
  onToggle,
  children,
}: {
  game: Game;
  state: GameState;
  today: string;
  open: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  const { sub, end } = summary(game, state, today);
  const detailId = `detail-${game.id.replace(/[^A-Za-z0-9]/g, "-")}`;
  return (
    <li className={`item${open ? " is-open" : ""}`}>
      <button type="button" className="row" aria-expanded={open} aria-controls={detailId} onClick={onToggle}>
        <span className="tk">{game.s}</span>
        <span className="row-main">
          <span className="row-line row-sides">
            <SideMark side={game.marc} who="You" />
            <span className="sep" aria-hidden="true">
              &middot;
            </span>
            <SideMark side={game.cramer} who="Cramer" />
          </span>
          <span className="row-sub">{sub}</span>
        </span>
        <span className="row-end">{end}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="row-detail" id={detailId}>
          {children}
        </div>
      )}
    </li>
  );
}

/** Read-only details for a matchup that is locked (kicked off or final). */
export function GameDetail({
  game,
  state,
  onRemove,
  confirming,
  onConfirm,
}: {
  game: Game;
  state: GameState;
  onRemove: () => void;
  confirming: boolean;
  onConfirm: () => void;
}) {
  const cr = state.kind === "final" ? resultFor(game.cramer, state.fin.sr, state.fin.br) : null;
  const word = (r: string | null) => (r === "W" ? "win" : r === "L" ? "loss" : "tie");
  // Only a matchup that can't be scored can be dropped; anything live or final stays on the record.
  const removable = state.kind === "nodata";
  return (
    <div className="slip">
      <div className="slip-context">
        <p className="slip-name">{game.n}</p>
        {game.title && (
          <p className="slip-headline">
            {game.link ? (
              <a href={game.link} target="_blank" rel="noreferrer noopener">
                {game.title}
              </a>
            ) : (
              game.title
            )}
          </p>
        )}
        <p className="slip-meta">
          {state.kind === "final" && (
            <>
              Kicked off at the {monthDayLabel(state.fin.k)} close, final at the {monthDayLabel(state.fin.e)} close.{" "}
              {game.marc === game.cramer
                ? `You and Cramer were on the same side, so you both get the ${word(cr)}.`
                : `Cramer gets the ${word(cr)}.`}{" "}
              {leadingSide(state.fin.sr, state.fin.br) &&
                `The ${leadingSide(state.fin.sr, state.fin.br) === "bull" ? "Bull" : "Bear"} side won by ${pts(state.fin.sr - state.fin.br)}.`}
            </>
          )}
          {state.kind === "live" && (
            <>Kicked off at the {monthDayLabel(state.kick)} close. Picks are locked until the final whistle.</>
          )}
          {state.kind === "pending" && <>Locked at kickoff. Waiting for the closing prices to come in.</>}
          {state.kind === "nodata" && (
            <>There are no prices for {game.s} right now, so this one can&rsquo;t be scored. If they never come back, you can drop it.</>
          )}
        </p>
      </div>
      {removable && (
        <div className="slip-foot">
          {confirming ? (
            <button type="button" className="text-btn is-danger" onClick={onRemove}>
              Tap again to drop it
            </button>
          ) : (
            <button type="button" className="text-btn" onClick={onConfirm}>
              Drop this matchup
            </button>
          )}
        </div>
      )}
    </div>
  );
}
