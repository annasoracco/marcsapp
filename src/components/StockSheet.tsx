import { useMemo, useState } from "react";
import type { Asset, Dataset } from "../lib/data";
import { fmtMonthOfDay, fmtShortDay } from "../lib/format";
import { isoToDay } from "../lib/data";
import { Sheet } from "./Sheet";

interface Props {
  ds: Dataset;
  current: string;
  complete: boolean;
  onPick: (symbol: string) => void;
  onClose: () => void;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9&^ -]/g, "")
    .trim();

/** Ranks curated assets for a query. Pure and local: searching never touches the network. */
export function searchAssets(assets: Asset[], query: string): Asset[] {
  const q = norm(query);
  if (!q) return [];
  const scored: [number, Asset][] = [];
  for (const a of assets) {
    const sym = a.symbol.toLowerCase().replace(/^\^/, "");
    const name = norm(a.name);
    const aliases = a.aliases.map(norm);
    let score = 0;
    if (sym === q) score = 100;
    else if (aliases.some((x) => x === q)) score = 90;
    else if (name.startsWith(q)) score = 80;
    else if (sym.startsWith(q)) score = 70;
    else if (name.split(/[\s(]+/).some((w) => w.startsWith(q))) score = 60;
    else if (aliases.some((x) => x.startsWith(q) || x.split(" ").some((w) => w.startsWith(q)))) score = 50;
    else if (name.includes(q)) score = 30;
    if (score) scored.push([score + (a.popular ? 5 : 0), a]);
  }
  return scored.sort((x, y) => y[0] - x[0] || x[1].name.localeCompare(y[1].name)).map((x) => x[1]);
}

const KIND_LABEL: Record<string, string> = { s: "Stock", e: "ETF", f: "Mutual fund", c: "Crypto", i: "Index" };

export function StockSheet({ ds, current, complete, onPick, onClose }: Props) {
  const [q, setQ] = useState("");
  const all = useMemo(() => ds.order.map((s) => ds.assets.get(s)!).filter(Boolean), [ds]);
  const results = useMemo(() => searchAssets(all, q), [all, q]);
  const pick = (s: string) => {
    onPick(s);
    onClose();
  };
  // Group this week's mentions by the segment they came from, newest first.
  const segments: { link: string; title: string; date: string; symbols: string[] }[] = [];
  for (const m of ds.mentions) {
    if (!ds.assets.has(m.s)) continue;
    let seg = segments.find((x) => x.link === m.link);
    if (!seg) segments.push((seg = { link: m.link, title: m.title, date: m.date, symbols: [] }));
    seg.symbols.push(m.s);
  }
  const popular = all.filter((a) => a.popular);
  const philly = all.filter((a) => a.philly);
  const rest = [...all].sort((a, b) => a.name.localeCompare(b.name));

  const row = (a: Asset) => (
    <li key={a.symbol}>
      <button type="button" className={`row${a.symbol === current ? " is-on" : ""}`} aria-pressed={a.symbol === current} onClick={() => pick(a.symbol)}>
        <span className="row-main">
          <span className="row-title">{a.name}</span>
          <span className="row-sub">
            {a.kind === "i" ? "Total return index" : `${a.symbol} · ${KIND_LABEL[a.kind] ?? ""}`} · since {fmtMonthOfDay(Math.max(a.firstDay, isoToDay("1988-01-04")))}
          </span>
        </span>
      </button>
    </li>
  );

  return (
    <Sheet title="Pick an investment" onClose={onClose}>
      <label className="field search">
        <span className="sr-only">Search stocks, funds, and crypto</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search: Apple, Nvidia, Bitcoin, VOO…"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="search"
        />
      </label>

      {q.trim() ? (
        results.length ? (
          <ul className="rows">{results.slice(0, 40).map(row)}</ul>
        ) : (
          <p className="quiet">
            Nothing called “{q.trim()}” in Hindsight’s list{complete ? "" : " yet (still loading the full list)"}. It covers about {all.length} well-known
            stocks, funds, and coins.
          </p>
        )
      ) : (
        <>
          {segments.length > 0 && (
            <div className="m-group">
              <h3 className="group-h">Mentioned on Mad Money this week</h3>
              <p className="quiet">Stocks CNBC tagged in this week’s segments. Mentions, not picks.</p>
              <ul className="mentions">
                {segments.slice(0, 4).map((seg) => (
                  <li key={seg.link} className="mention-group">
                    <a className="seg" href={seg.link} target="_blank" rel="noopener noreferrer">
                      <span>{fmtShortDay(isoToDay(seg.date))}</span>
                      <span className="seg-title">{seg.title}</span>
                      <span aria-hidden="true">↗</span>
                    </a>
                    <div className="chips">
                      {seg.symbols.map((s) => (
                        <button type="button" key={s} className={`chip${s === current ? " is-on" : ""}`} aria-pressed={s === current} onClick={() => pick(s)}>
                          {ds.assets.get(s)!.name.replace(/\s*\(.*\)$/, "")}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="m-group">
            <h3 className="group-h">Popular</h3>
            <ul className="rows">{popular.map(row)}</ul>
          </div>
          {philly.length > 0 && (
            <div className="m-group">
              <h3 className="group-h">Philadelphia-area companies</h3>
              <ul className="rows">{philly.map(row)}</ul>
            </div>
          )}
          <div className="m-group">
            <h3 className="group-h">Everything, A to Z</h3>
            <ul className="rows">{rest.map(row)}</ul>
            {!complete && <p className="quiet">Loading the rest of the list…</p>}
          </div>
        </>
      )}
      <p className="quiet note">
        Hindsight only lists companies that are still around today. Ones that went bust or were bought out aren’t here, which makes history look a
        little rosier than it was.
      </p>
    </Sheet>
  );
}
