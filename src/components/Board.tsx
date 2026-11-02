import { Fragment, useMemo, useState, type ReactNode } from "react";
import type { ShowNight, SlateStock } from "../lib/slate";
import type { Side } from "../lib/game";
import { addDays, dayName, monthDayLabel, rangeLabel } from "../lib/dates";
import { plural } from "../lib/format";
import { Chevron, ExternalIcon, Pct, SideMark } from "./bits";
import { PickSlip } from "./PickSlip";

interface Props {
  nights: ShowNight[];
  picked: Set<string>;
  hidden: Set<string>;
  owned: Set<string>;
  now: Date;
  benchSince: (air: string) => number | null;
  onLock: (stock: SlateStock, cramer: Side, marc: Side) => void;
  onHide: (id: string) => void;
  onUnhideAll: () => void;
  onToggleOwn: (s: string) => void;
}

const isLead = (s: SlateStock) => s.named || s.primary || Boolean(s.suggest);

export function Board({ nights, picked, hidden, owned, now, benchSince, onLock, onHide, onUnhideAll, onToggleOwn }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [showEarlier, setShowEarlier] = useState(false);
  /** Show nights whose expanded state differs from the default (only the latest night starts open). */
  const [toggled, setToggled] = useState<Set<string>>(() => new Set());
  const toggle = (id: string) => setOpen((cur) => (cur === id ? null : id));

  const view = useMemo(() => {
    const open = (s: SlateStock) => !picked.has(s.id) && !hidden.has(s.id);
    const newest = nights[0]?.air;
    const cutoff = newest ? addDays(newest, -6) : "";
    const yours: SlateStock[] = [];
    const seenYours = new Set<string>();
    const shape = (list: ShowNight[]) =>
      list
        .map((night) => ({
          air: night.air,
          segments: night.segments
            .map((seg) => {
              const stocks = seg.stocks.filter((s) => {
                if (!open(s)) return false;
                if (owned.has(s.s)) {
                  if (!seenYours.has(s.s)) {
                    seenYours.add(s.s);
                    yours.push(s);
                  }
                  return false;
                }
                return true;
              });
              return { ...seg, lead: stocks.filter(isLead), rest: stocks.filter((s) => !isLead(s)) };
            })
            .filter((seg) => seg.lead.length || seg.rest.length),
        }))
        .filter((n) => n.segments.length);
    const thisWeek = shape(nights.filter((n) => n.air >= cutoff));
    const earlier = shape(nights.filter((n) => n.air < cutoff));
    const count = (list: typeof thisWeek) =>
      list.reduce((a, n) => a + n.segments.reduce((b, s) => b + s.lead.length + s.rest.length, 0), 0);
    let hiddenCount = 0;
    for (const n of nights) for (const seg of n.segments) for (const s of seg.stocks) if (hidden.has(s.id)) hiddenCount++;
    return { yours, thisWeek, earlier, hiddenCount, openCount: count(thisWeek) + yours.length, earlierCount: count(earlier) };
  }, [nights, picked, hidden, owned]);

  const slip = (s: SlateStock) => (
    <PickSlip
      key={s.id}
      stock={s}
      owned={owned.has(s.s)}
      benchSince={benchSince(s.air)}
      now={now}
      onLock={(c, m) => {
        setOpen(null);
        onLock(s, c, m);
      }}
      onToggleOwn={() => onToggleOwn(s.s)}
      onHide={() => {
        setOpen(null);
        onHide(s.id);
      }}
    />
  );

  const row = (s: SlateStock, showDay = false) => {
    const isOpen = open === s.id;
    const notes: ReactNode[] = [];
    if (showDay) notes.push(`${dayName(s.air)}'s show`);
    if (owned.has(s.s) && !showDay) notes.push("You own it");
    if (s.suggest)
      notes.push(
        <>
          headline reads <SideMark side={s.suggest} />
        </>,
      );
    if (s.since !== undefined)
      notes.push(
        <>
          <Pct value={s.since} /> since the show
        </>,
      );
    if (!s.playable) notes.push("No prices yet");
    return (
      <li key={s.id} className={`item${isOpen ? " is-open" : ""}`}>
        <button type="button" className="row" aria-expanded={isOpen} onClick={() => toggle(s.id)}>
          <span className="tk">{s.s}</span>
          <span className="row-main">
            <span className="row-line row-name">{s.n}</span>
            {notes.length > 0 && (
              <span className="row-sub">
                {notes.map((n, i) => (
                  <Fragment key={i}>
                    {i > 0 && " \u00b7 "}
                    {n}
                  </Fragment>
                ))}
              </span>
            )}
          </span>
          <span className="row-end">
            <span className="pick-cue">{isOpen ? "" : "Pick"}</span>
          </span>
          <Chevron open={isOpen} />
        </button>
        {isOpen && <div className="row-detail">{slip(s)}</div>}
      </li>
    );
  };

  const nightBlock = (night: (typeof view.thisWeek)[number]) => {
    const n = night.segments.reduce((a, s) => a + s.lead.length + s.rest.length, 0);
    const isOpen = toggled.has(night.air) !== (night.air === view.thisWeek[0]?.air);
    const bodyId = `night-body-${night.air}`;
    return (
      <section key={night.air} className={`night${isOpen ? " is-open" : ""}`} aria-labelledby={`night-${night.air}`}>
        <h3 id={`night-${night.air}`} className="night-head">
          <button
            type="button"
            className="night-toggle"
            aria-expanded={isOpen}
            aria-controls={bodyId}
            onClick={() =>
              setToggled((cur) => {
                const next = new Set(cur);
                if (next.has(night.air)) next.delete(night.air);
                else next.add(night.air);
                return next;
              })
            }
          >
            <span>
              {dayName(night.air)}, {monthDayLabel(night.air)}
            </span>
            <span className="night-count">
              {n} open
              <Chevron open={isOpen} />
            </span>
          </button>
        </h3>
        {isOpen && (
          <div id={bodyId}>
            {night.segments.map((seg) => {
              const chipOpen = seg.rest.find((s) => s.id === open);
              return (
                <article key={seg.link} className="segment">
                  <p className="seg-title">
                    <a href={seg.link} target="_blank" rel="noreferrer noopener">
                      {seg.title}
                      <ExternalIcon />
                    </a>
                  </p>
                  {seg.lead.length > 0 && <ul className="list">{seg.lead.map((s) => row(s))}</ul>}
                  {seg.rest.length > 0 && (
                    <div className="also">
                      <p className="also-label">{seg.lead.length ? "Also on this segment" : "Stocks on this segment"}</p>
                      <div className="chips">
                        {seg.rest.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            className={`chip${open === s.id ? " is-on" : ""}`}
                            aria-expanded={open === s.id}
                            aria-label={`${s.s}, ${s.n}`}
                            onClick={() => toggle(s.id)}
                          >
                            {s.s}
                          </button>
                        ))}
                      </div>
                      {chipOpen && (
                        <div className="chip-detail">
                          <p className="chip-title">
                            <span className="tk">{chipOpen.s}</span> {chipOpen.n}
                          </p>
                          {slip(chipOpen)}
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  const empty = !view.openCount && !view.earlierCount;
  const airs = view.thisWeek.map((n) => n.air).sort();
  const range = airs.length ? rangeLabel(airs[0], airs[airs.length - 1]) : "";
  return (
    <section className="block" aria-labelledby="board-h">
      <div className="block-head">
        <h2 id="board-h">The board</h2>
      </div>
      <p className="block-sub">
        {range ? `From Mad Money, ${range}. ` : ""}Tap a stock, confirm Cramer&rsquo;s call, make yours.
      </p>

      {empty && (
        <p className="empty">
          {nights.length
            ? "You've worked through every stock from the latest shows. New ones land the evening after each Mad Money."
            : "No Mad Money segments have come in yet. They land the evening after each show."}
        </p>
      )}

      {view.yours.length > 0 && (
        <section className="night night-yours" aria-labelledby="yours-h">
          <h3 id="yours-h" className="night-head">
            <span>Cramer talked about your stocks</span>
          </h3>
          <ul className="list">{view.yours.map((s) => row(s, true))}</ul>
        </section>
      )}

      {view.thisWeek.map(nightBlock)}

      {view.earlier.length > 0 &&
        (showEarlier ? (
          view.earlier.map(nightBlock)
        ) : (
          <button type="button" className="more-btn" onClick={() => setShowEarlier(true)}>
            Earlier shows ({view.earlierCount})
          </button>
        ))}

      {view.hiddenCount > 0 && (
        <p className="board-foot">
          {plural(view.hiddenCount, "stock")} taken off the board.{" "}
          <button type="button" className="text-btn inline" onClick={onUnhideAll}>
            Put them back
          </button>
        </p>
      )}
    </section>
  );
}
