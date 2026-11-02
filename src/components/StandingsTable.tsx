import type { Standings as S, TeamRecord } from "../lib/game";
import { plural, winPct, wl } from "../lib/format";
import { ResultMark } from "./bits";

function streak(r: TeamRecord): string {
  return r.streak ? `${r.streak.r}${r.streak.n}` : "\u2014";
}

export function leadLine(st: S): string {
  if (!st.games) return "Your season starts with your first pick. A matchup counts once it goes final.";
  const lead = st.marc.w - st.cramer.w;
  const head = lead > 0 ? `You lead by ${plural(lead, "game")}.` : lead < 0 ? `Cramer leads by ${plural(-lead, "game")}.` : "All square.";
  const h2h = st.h2h.marc + st.h2h.cramer;
  const tail = h2h
    ? ` You're ${st.h2h.marc}\u2013${st.h2h.cramer} when you go against him.`
    : " You've agreed with him on every call so far.";
  return head + tail;
}

export function StandingsTable({ st, context }: { st: S; context: string }) {
  const rows: [string, string, TeamRecord][] = [
    ["Marc", "is-marc", st.marc],
    ["Cramer", "is-cramer", st.cramer],
  ];
  return (
    <div className="standings">
      <table>
        <caption className="sr-only">Standings, {context}</caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Player</span>
            </th>
            <th scope="col" className="col-rec">
              W&ndash;L
            </th>
            <th scope="col">Pct</th>
            <th scope="col">Streak</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, cls, r]) => (
            <tr key={name} className={cls}>
              <th scope="row">
                <span className="who-dot" aria-hidden="true" />
                {name}
              </th>
              <td className="num rec">{wl(r)}</td>
              <td className="num">{winPct(r)}</td>
              <td className="num">{streak(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="lead-line">
        <span className="lead-context">{context}.</span> {leadLine(st)}
      </p>
    </div>
  );
}

/** The last ten results for each side, oldest first. */
export function FormGuide({ st }: { st: S }) {
  const rows: [string, string, TeamRecord][] = [
    ["Marc", "is-marc", st.marc],
    ["Cramer", "is-cramer", st.cramer],
  ];
  return (
    <div className="form-wrap">
      <dl className="form-guide">
        {rows.map(([name, cls, r]) => (
          <div key={name} className={cls}>
            <dt>
              {name}, last {r.last.length}
            </dt>
            <dd>
              <span className="form" aria-label={r.last.map((x) => ({ W: "win", L: "loss", T: "tie" })[x]).join(", ")}>
                {r.last.map((x, i) => (
                  <ResultMark key={i} r={x} />
                ))}
              </span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="form-note">Oldest to newest, left to right.</p>
    </div>
  );
}
