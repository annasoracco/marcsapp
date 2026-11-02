import { useId, useState } from "react";
import type { Side } from "../lib/game";
import { kickoffDate } from "../lib/game";
import { closeLabel, dayDateLabel, todayET } from "../lib/dates";
import { ExternalIcon, Pct } from "./bits";

export interface SlipStock {
  id: string;
  s: string;
  n: string;
  air: string;
  title: string;
  link: string;
  playable: boolean;
  suggest?: Side;
  since?: number;
}

interface Props {
  stock: SlipStock;
  owned: boolean;
  benchSince: number | null;
  initial?: { cramer: Side; marc: Side };
  now: Date;
  onLock: (cramer: Side, marc: Side) => void;
  onToggleOwn: () => void;
  onHide?: () => void;
  onRemove?: () => void;
}

function Choice({
  name,
  value,
  current,
  suggested,
  label,
  hint,
  onPick,
}: {
  name: string;
  value: Side;
  current: Side | undefined;
  suggested?: boolean;
  label: string;
  hint?: string;
  onPick: (v: Side) => void;
}) {
  const cls = ["opt", `opt-${value}`, current === value && "is-on", suggested && !current && "is-suggested"].filter(Boolean).join(" ");
  const note = suggested && !current ? "Suggested" : hint;
  return (
    <label className={cls}>
      <input type="radio" name={name} value={value} checked={current === value} onChange={() => onPick(value)} />
      <span className="opt-label">
        <svg className="side-arrow" viewBox="0 0 10 10" aria-hidden="true">
          {value === "bull" ? <path d="M5 1.5 9 8.5H1z" /> : <path d="M5 8.5 1 1.5h8z" />}
        </svg>
        {label}
      </span>
      {note && <span className="opt-hint">{note}</span>}
    </label>
  );
}

export function PickSlip({ stock, owned, benchSince, initial, now, onLock, onToggleOwn, onHide, onRemove }: Props) {
  const uid = useId();
  const [cramer, setCramer] = useState<Side | undefined>(initial?.cramer);
  const [marc, setMarc] = useState<Side | undefined>(initial?.marc);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const kick = closeLabel(kickoffDate(now), todayET(now));
  const ready = Boolean(cramer && marc);

  return (
    <div className="slip">
      <div className="slip-context">
        <p className="slip-headline">
          <a href={stock.link} target="_blank" rel="noreferrer noopener">
            {stock.title}
            <ExternalIcon />
          </a>
        </p>
        <p className="slip-meta">
          Mad Money, {dayDateLabel(stock.air)}.
          {stock.since !== undefined && (
            <>
              {" "}
              Since then: {stock.s} <Pct value={stock.since} />
              {benchSince !== null && (
                <>
                  , S&amp;P 500 <Pct value={benchSince} />
                </>
              )}
              .
            </>
          )}
        </p>
        <button type="button" className={`own-toggle${owned ? " is-on" : ""}`} aria-pressed={owned} onClick={onToggleOwn}>
          <svg viewBox="0 0 12 12" aria-hidden="true">
            <path d="m6 1.2 1.5 3.1 3.4.5-2.5 2.4.6 3.4L6 9 2.9 10.6l.6-3.4L1 4.8l3.4-.5z" />
          </svg>
          {owned ? "You own it" : "I own this"}
        </button>
      </div>

      {!stock.playable ? (
        <p className="slip-note">
          There are no prices for {stock.s} yet, so it can't be scored. It may show up after the next data refresh.
        </p>
      ) : (
        <form
          className="slip-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (cramer && marc) onLock(cramer, marc);
          }}
        >
          <fieldset className="pair">
            <legend>Cramer's call</legend>
            <div className="opts">
              <Choice name={`${uid}-c`} value="bull" current={cramer} suggested={stock.suggest === "bull"} label="Bull" onPick={setCramer} />
              <Choice name={`${uid}-c`} value="bear" current={cramer} suggested={stock.suggest === "bear"} label="Bear" onPick={setCramer} />
            </div>
            {stock.suggest && !cramer && (
              <p className="pair-note">
                The headline reads {stock.suggest === "bull" ? "Bull" : "Bear"}. Tap it to confirm, or pick what he actually said.
              </p>
            )}
          </fieldset>
          <fieldset className="pair">
            <legend>Your pick</legend>
            <div className="opts">
              <Choice name={`${uid}-m`} value="bull" current={marc} label="Bull" hint="Beats the S&P" onPick={setMarc} />
              <Choice name={`${uid}-m`} value="bear" current={marc} label="Bear" hint="Trails the S&P" onPick={setMarc} />
            </div>
          </fieldset>
          <button type="submit" className="lock" disabled={!ready}>
            {initial ? "Update pick" : "Lock it in"}
          </button>
          <p className="slip-fine">
            {ready ? (cramer === marc ? "You're siding with Cramer. " : "You're going against Cramer. ") : ""}
            Kicks off at {kick}, final five trading days later.
          </p>
        </form>
      )}

      <div className="slip-foot">
        {onHide && (
          <button type="button" className="text-btn" onClick={onHide}>
            Not a real call? Take it off the board
          </button>
        )}
        {onRemove &&
          (confirmRemove ? (
            <button type="button" className="text-btn is-danger" onClick={onRemove}>
              Tap again to remove this pick
            </button>
          ) : (
            <button type="button" className="text-btn" onClick={() => setConfirmRemove(true)}>
              Remove this pick
            </button>
          ))}
      </div>
    </div>
  );
}
