import type { Dataset } from "../lib/data";
import { fmtDay, fmtIsoMonth } from "../lib/format";

export function Footer({ ds }: { ds: Dataset }) {
  return (
    <footer className="footer">
      <h2 className="footer-h">How the math works</h2>
      <ul className="method">
        <li>Real daily closing prices from Yahoo Finance, adjusted so dividends are reinvested and splits are handled.</li>
        <li>You buy at the first close on or after your start date and hold through the latest close ({fmtDay(ds.asOfDay)}). Fractional shares, no trading after that.</li>
        <li>The S&amp;P 500 line is the S&amp;P 500 Total Return index (dividends reinvested), bought and valued on the nearest trading days.</li>
        <li>
          “In today’s dollars” uses the Consumer Price Index (CPI-U, from FRED) through {fmtIsoMonth(ds.cpi.last)}
          {ds.cpi.filled.length ? `. BLS never published ${ds.cpi.filled.map(fmtIsoMonth).join(" and ")}, so that month is filled in between its neighbors` : ""}.
        </li>
        <li>Worst drop means the biggest fall from a high, close to close, after you bought.</li>
        <li>Prices start in January 1988. The list only has investments that still exist today.</li>
      </ul>
      <p className="fine">
        For fun, not financial advice. Hypothetical, pre-tax, no fees, dividends reinvested. Not affiliated with CNBC, Jim Cramer, the NFL, or the
        Philadelphia Eagles. Data: Yahoo Finance, FRED.
      </p>
      <p className="fine">Everything you type stays on this phone. Hindsight has no accounts, no tracking, and no ads.</p>
    </footer>
  );
}
