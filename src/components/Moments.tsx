import { useState } from "react";
import type { Asset, Dataset, Moment } from "../lib/data";
import { isoToDay, monthIndexOf } from "../lib/data";
import type { ScenarioInput, StartRef } from "../lib/engine";
import { clampMonth, computeScenario, monthRange } from "../lib/engine";
import { fmtDay, fmtMonthIndex, fmtMoneyShort } from "../lib/format";
import type { SavedDate } from "../lib/store";
import { shortName } from "./Hero";

interface Props {
  ds: Dataset;
  input: ScenarioInput;
  saved: SavedDate[];
  onPick: (start: StartRef) => void;
  onSave: (d: SavedDate) => void;
  onRemove: (id: string) => void;
}

const sameStart = (a: StartRef, b: StartRef) =>
  a.kind === b.kind && (a.kind === "month" ? a.m === (b as { m: number }).m : a.id === (b as { id: string }).id);

export function Moments({ ds, input, saved, onPick, onSave, onRemove }: Props) {
  const asset = ds.assets.get(input.symbol)!;
  const name = shortName(asset.name);
  const groups: [string, Moment[]][] = [
    ["Market moments", ds.moments.filter((m) => m.group === "market")],
    ["Eagles moments", ds.moments.filter((m) => m.group === "eagles")],
  ];

  const result = (start: StartRef) => {
    const sc = computeScenario(ds, { ...input, start });
    if (!sc) return null;
    const up = sc.value >= sc.invested;
    return (
      <span className={`m-val ${up ? "gain" : "loss"}`}>
        <span className="m-from">{fmtMoneyShort(sc.invested)} →</span> <span aria-hidden="true">{up ? "" : "▼ "}</span>
        {fmtMoneyShort(sc.value)}
      </span>
    );
  };

  return (
    <section className="section" aria-labelledby="moments-h">
      <h2 id="moments-h" className="section-h">
        Moments
      </h2>
      <p className="section-lede">Start the clock on a day you remember. Each one shows {name} from the first close on or after it.</p>
      {groups.map(([title, list]) => (
        <div className="m-group" key={title}>
          <h3 className="group-h">{title}</h3>
          <ul className="rows">
            {list.map((m) => {
              const start: StartRef = { kind: "moment", id: m.id };
              const ms = asset.moments.get(m.id);
              const on = sameStart(input.start, start);
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className={`row${on ? " is-on" : ""}`}
                    aria-pressed={on}
                    disabled={!ms}
                    onClick={() => onPick(start)}
                  >
                    <span className="row-main">
                      <span className="row-title">{m.name}</span>
                      <span className="row-sub">{fmtDay(isoToDay(m.date))}</span>
                    </span>
                    {ms ? result(start) : <span className="m-na">{notYet(asset)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <YourDates ds={ds} input={input} saved={saved} onPick={onPick} onSave={onSave} onRemove={onRemove} result={result} />
    </section>
  );
}

function YourDates({
  ds,
  input,
  saved,
  onPick,
  onSave,
  onRemove,
  result,
}: Omit<Props, never> & { result: (s: StartRef) => React.ReactNode }) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [month, setMonth] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const asset = ds.assets.get(input.symbol)!;
  const { max } = monthRange(asset);
  const maxIso = fmtIso(max);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const nm = label.trim();
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    if (!nm) return setProblem("Give the date a name, like “My birthday”.");
    if (!match) return setProblem("Pick a month and year.");
    const m = monthIndexOf(Number(match[1]), Number(match[2]) - 1);
    if (m < 0) return setProblem("Hindsight’s prices start in January 1988.");
    if (m > max) return setProblem(`Pick a month up to ${fmtMonthIndex(max)}.`);
    onSave({ id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name: nm.slice(0, 40), m });
    setLabel("");
    setMonth("");
    setProblem(null);
    setAdding(false);
  };

  return (
    <div className="m-group">
      <h3 className="group-h">Your dates</h3>
      {saved.length ? (
        <ul className="rows">
          {saved.map((d) => {
            const { min } = monthRange(asset);
            const ok = d.m >= min;
            const start: StartRef = { kind: "month", m: clampMonth(asset, d.m) };
            const on = ok && sameStart(input.start, { kind: "month", m: d.m });
            return (
              <li key={d.id} className="row-wrap">
                <button type="button" className={`row${on ? " is-on" : ""}`} aria-pressed={on} disabled={!ok} onClick={() => onPick(start)}>
                  <span className="row-main">
                    <span className="row-title">{d.name}</span>
                    <span className="row-sub">{fmtMonthIndex(d.m)}</span>
                  </span>
                  {ok ? result(start) : <span className="m-na">{notYet(asset)}</span>}
                </button>
                <button type="button" className="row-x" aria-label={`Remove ${d.name}`} onClick={() => onRemove(d.id)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7 7l10 10M17 7L7 17" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="quiet">A birthday, a first job, the day you got married. They stay on this phone.</p>
      )}
      {adding ? (
        <form className="add-date" onSubmit={save} noValidate>
          <label className="field">
            <span>Name</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} autoComplete="off" placeholder="My birthday" />
          </label>
          <label className="field">
            <span>Month</span>
            <input type="month" value={month} min="1988-01" max={maxIso} onChange={(e) => setMonth(e.target.value)} />
          </label>
          {problem && (
            <p className="problem" role="alert">
              {problem}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="btn primary">
              Save date
            </button>
            <button type="button" className="btn text" onClick={() => (setAdding(false), setProblem(null))}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn secondary" onClick={() => setAdding(true)}>
          Save a date
        </button>
      )}
    </div>
  );
}

/** Why a start isn't available: a real listing hadn't happened, or Hindsight's prices simply start later. */
export function notYet(asset: Asset): string {
  return asset.ipo ? `${shortName(asset.name)} wasn’t trading yet` : `Prices start ${fmtMonthIndex(monthRange(asset).min)}`;
}

const fmtIso = (mi: number) => `${1988 + Math.floor(mi / 12)}-${String((mi % 12) + 1).padStart(2, "0")}`;
