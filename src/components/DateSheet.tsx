import { useState } from "react";
import type { Dataset } from "../lib/data";
import { isoToDay } from "../lib/data";
import type { StartRef } from "../lib/engine";
import { clampMonth, monthRange } from "../lib/engine";
import { fmtDay, fmtMonthIndex } from "../lib/format";
import { Sheet } from "./Sheet";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Props {
  ds: Dataset;
  symbol: string;
  month: number;
  onPick: (start: StartRef) => void;
  onClose: () => void;
}

export function DateSheet({ ds, symbol, month, onPick, onClose }: Props) {
  const asset = ds.assets.get(symbol)!;
  const { min, max } = monthRange(asset);
  const [y, setY] = useState(1988 + Math.floor(month / 12));
  const [mo, setMo] = useState(month % 12);
  const years: number[] = [];
  for (let k = 1988 + Math.floor(min / 12); k <= 1988 + Math.floor(max / 12); k++) years.push(k);
  const target = clampMonth(asset, (y - 1988) * 12 + mo);
  const exact = target === (y - 1988) * 12 + mo;

  return (
    <Sheet title="When?" onClose={onClose}>
      <div className="selects">
        <label className="field">
          <span>Month</span>
          <select value={mo} onChange={(e) => setMo(Number(e.target.value))}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Year</span>
          <select value={y} onChange={(e) => setY(Number(e.target.value))}>
            {years.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!exact && <p className="quiet">The closest month with prices is {fmtMonthIndex(target)}.</p>}
      <button
        type="button"
        className="btn primary wide"
        onClick={() => {
          onPick({ kind: "month", m: target });
          onClose();
        }}
      >
        Start in {fmtMonthIndex(target)}
      </button>
      <div className="m-group">
        <h3 className="group-h">Or a moment</h3>
        <ul className="rows">
          {ds.moments.map((m) => {
            const ok = asset.moments.has(m.id);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  className="row"
                  disabled={!ok}
                  onClick={() => {
                    onPick({ kind: "moment", id: m.id });
                    onClose();
                  }}
                >
                  <span className="row-main">
                    <span className="row-title">{m.name}</span>
                    <span className="row-sub">{fmtDay(isoToDay(m.date))}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </Sheet>
  );
}
