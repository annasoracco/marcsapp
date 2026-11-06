import type { Dataset, Moment } from "../lib/data";
import { isoToDay } from "../lib/data";
import type { Scenario } from "../lib/engine";
import { fmtAmount, fmtDay, fmtIsoMonth, fmtMoney, fmtMonthOfDay, fmtMultiple, fmtPct } from "../lib/format";
import { useWidth } from "../lib/useWidth";
import { Chart } from "./Chart";
import { HeroNumber } from "./HeroNumber";

export type Field = "amount" | "stock" | "date";

interface Props {
  ds: Dataset;
  scenario: Scenario;
  moment: Moment | null;
  instant: boolean;
  drawKey: string;
  onEdit: (f: Field) => void;
  onHeld: () => void;
}

export function shortName(name: string) {
  return name.replace(/\s*\(.*\)\s*$/, "");
}

export function Hero({ ds, scenario: sc, moment, instant, drawKey, onEdit, onHeld }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const name = shortName(sc.asset.name);
  const up = sc.value >= sc.invested;
  const isMoment = sc.start.kind === "moment";
  const dateText = isMoment ? fmtDay(sc.startDay) : fmtMonthOfDay(sc.startDay);
  const isBench = sc.asset.symbol === ds.benchmark;
  const cpiMonth = fmtIsoMonth(ds.cpi.last);
  const spDiffers = sc.sp && (sc.sp.startDay !== sc.startDay || sc.sp.endDay !== sc.endDay);

  return (
    <section className="hero" aria-labelledby="hero-q">
      <div className="hero-inner" ref={ref}>
        <h1 id="hero-q" className="question">
          If you’d put{" "}
          <button type="button" className="token" onClick={() => onEdit("amount")} aria-label={`Amount, ${fmtAmount(sc.amount)}. Change it`}>
            {fmtAmount(sc.amount)}
          </button>{" "}
          into{" "}
          <button type="button" className="token" onClick={() => onEdit("stock")} aria-label={`Investment, ${sc.asset.name}. Change it`}>
            {name}
          </button>{" "}
          {isMoment ? "on" : "in"}{" "}
          <button type="button" className="token" onClick={() => onEdit("date")} aria-label={`Start, ${dateText}. Change it`}>
            {dateText}
          </button>
          , <span className="q-tail">you’d have</span>
        </h1>

        <HeroNumber value={sc.value} instant={instant} width={width} />
        <p className={`delta ${up ? "gain" : "loss"}`}>
          <span aria-hidden="true">{up ? "▲" : "▼"}</span> {fmtPct(sc.gain, false)} {up ? "gain" : "loss"}
          <span className="dot" aria-hidden="true">
            ·
          </span>
          {fmtMultiple(sc.multiple)} your money
        </p>
        <p className="story">
          {isBench
            ? "That’s the whole S&P 500, every dividend reinvested."
            : sc.sp
              ? `The S&P 500 would have made it ${fmtMoney(sc.sp.value)}.`
              : null}
          {sc.real ? ` ${fmtAmount(sc.amount)} back then is ${fmtMoney(sc.invested)} in ${cpiMonth} dollars, and every amount here is in ${cpiMonth} dollars.` : ""}
        </p>
      </div>

      <Chart scenario={sc} name={name} drawKey={drawKey} />

      <div className="hero-inner">
        <p className="window">
          From the close on {fmtDay(sc.startDay)}
          {sc.firstTradingDay ? ` (${name}’s first day of trading)` : ""} to the close on {fmtDay(sc.endDay)}, dividends reinvested.
          {moment ? ` ${moment.name}: ${fmtDay(isoToDay(moment.date))}. Hindsight uses the first close on or after it.` : ""}
          {spDiffers ? ` The S&P 500 is measured ${fmtDay(sc.sp!.startDay)} to ${fmtDay(sc.sp!.endDay)}, its nearest trading days.` : ""}
        </p>
        {sc.dd && sc.dd.pct <= -0.1 && (
          <button type="button" className="bridge" onClick={onHeld}>
            It wasn’t a straight line. Would you have held?&nbsp;
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        )}
      </div>
    </section>
  );
}
