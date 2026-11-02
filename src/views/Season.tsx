import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import { useGames } from "../lib/useGames";
import { type FinalGame, byFinish, resultFor, seasonOf, standings, weekByWeek, weekNumber } from "../lib/game";
import { addDays, mondayOf, todayET, weekRange } from "../lib/dates";
import { pct, pts, wl } from "../lib/format";
import { FormGuide, StandingsTable } from "../components/StandingsTable";
import { GameDetail, GameRow } from "../components/GameRow";
import { SideMark } from "../components/bits";
import { seasonContext } from "./Home";

function Notable({ label, game }: { label: string; game: FinalGame | undefined }) {
  if (!game) return null;
  const won = resultFor(game.marc, game.fin.sr, game.fin.br) === "W";
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        <span className="tk">{game.s}</span> <SideMark side={game.marc} />: {pct(game.fin.sr)} vs. S&amp;P{" "}
        {pct(game.fin.br)}, {won ? "won" : "lost"} by {pts(game.fin.sr - game.fin.br)}
      </dd>
    </div>
  );
}

export function Season({ now }: { now: Date }) {
  const g = useGames();
  const { dispatch } = useStore();
  const today = todayET(now);
  const current = Number(today.slice(0, 4));
  const years = useMemo(() => {
    const set = new Set<number>([current]);
    for (const f of g.finals) set.add(seasonOf(f.fin.k));
    return [...set].sort((a, b) => b - a);
  }, [g.finals, current]);
  const [year, setYear] = useState(current);
  const [open, setOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const finals = g.finals.filter((f) => seasonOf(f.fin.k) === year);
  const st = standings(finals);
  const seasonKicks = g.all
    .map((e) => (e.state.kind === "final" ? e.state.fin.k : e.game.kick))
    .filter((k) => seasonOf(k) === year)
    .sort();
  const firstKick = seasonKicks[0];
  const byWeek = new Map(weekByWeek(finals, firstKick).map((w) => [w.week, w]));
  const lastWeek = firstKick
    ? Math.max(year === current ? weekNumber(firstKick, today) : 1, ...seasonKicks.map((k) => weekNumber(firstKick, k)))
    : 0;
  const weekRows = Array.from({ length: lastWeek }, (_, i) => lastWeek - i).map((week) => ({
    week,
    monday: addDays(mondayOf(firstKick ?? today), (week - 1) * 7),
    line: byWeek.get(week),
    playing: seasonKicks.some((k) => weekNumber(firstKick ?? k, k) === week),
  }));
  const thisWeek = year === current && firstKick ? weekNumber(firstKick, today) : 0;
  const log = [...finals].sort(byFinish).reverse();
  const margin = (f: FinalGame) => Math.abs(f.fin.sr - f.fin.br);
  const wins = finals.filter((f) => resultFor(f.marc, f.fin.sr, f.fin.br) === "W").sort((a, b) => margin(b) - margin(a));
  const losses = finals.filter((f) => resultFor(f.marc, f.fin.sr, f.fin.br) === "L").sort((a, b) => margin(b) - margin(a));
  const context =
    year === current
      ? seasonContext(year, g.all.map((e) => (e.state.kind === "final" ? e.state.fin.k : e.game.kick)), today).replace(/^\d{4} season, /, "")
      : "Final standings";

  return (
    <>
      <div className="page-head">
        <h1>{year} season</h1>
        {years.length > 1 && (
          <label className="year-pick">
            <span className="sr-only">Season</span>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <StandingsTable st={st} context={context} />

      {finals.length === 0 ? (
        <p className="empty">
          No finals yet. A matchup goes final five trading days after it kicks off, and it lands here with the result.
        </p>
      ) : (
        <>
          <FormGuide st={st} />
          <dl className="notables">
            <Notable label="Your biggest win" game={wins[0]} />
            <Notable label="Your toughest loss" game={losses[0]} />
          </dl>

          <section className="block" aria-labelledby="weeks-h">
            <div className="block-head">
              <h2 id="weeks-h">Week by week</h2>
            </div>
            <table className="weeks">
              <thead>
                <tr>
                  <th scope="col">Week</th>
                  <th scope="col">
                    <span className="sr-only">Dates</span>
                  </th>
                  <th scope="col" className="num">
                    Marc
                  </th>
                  <th scope="col" className="num">
                    Cramer
                  </th>
                </tr>
              </thead>
              <tbody>
                {weekRows.map(({ week, monday, line, playing }) => {
                  const won = line ? (line.marc.w > line.cramer.w ? "is-marc" : line.marc.w < line.cramer.w ? "is-cramer" : "") : "is-empty";
                  const note = playing ? "In play" : "Bye";
                  return (
                    <tr key={week} className={won}>
                      <th scope="row">{week}</th>
                      <td className="weeks-dates">{week === thisWeek ? "This week" : weekRange(monday)}</td>
                      {line ? (
                        <>
                          <td className="num weeks-marc">{wl(line.marc)}</td>
                          <td className="num weeks-cramer">{wl(line.cramer)}</td>
                        </>
                      ) : (
                        <td className="weeks-note" colSpan={2}>
                          {note}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="block" aria-labelledby="log-h">
            <div className="block-head">
              <h2 id="log-h">Every matchup</h2>
              <span className="block-count">{finals.length}</span>
            </div>
            <ul className="list">
              {log.map((game) => (
                <GameRow
                  key={game.id}
                  game={game}
                  state={{ kind: "final", fin: game.fin }}
                  today={today}
                  open={open === game.id}
                  onToggle={() => {
                    setConfirming(null);
                    setOpen((cur) => (cur === game.id ? null : game.id));
                  }}
                >
                  <GameDetail
                    game={game}
                    state={{ kind: "final", fin: game.fin }}
                    confirming={confirming === game.id}
                    onConfirm={() => setConfirming(game.id)}
                    onRemove={() => {
                      dispatch({ type: "remove", id: game.id });
                      setOpen(null);
                    }}
                  />
                </GameRow>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}
