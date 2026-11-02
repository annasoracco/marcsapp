// Suggests calls to track from official Mad Money RSS headlines (headline text only).
// Matching is deterministic: explicit tickers like "(NVDA)", "$NVDA", or a bare covered ticker
// in capitals, or a covered company's name written as a proper noun.
import type { MarketFile, NewsItem } from "./marketTypes";
import type { CramerCall } from "./types";
import { etDate } from "./dates";
import { shortName } from "./names";

const GENERIC_FIRST = new Set([
  "American", "General", "First", "United", "National", "International", "Global", "Southern", "Northern", "Western",
  "Eastern", "Public", "Royal", "Digital", "Energy", "Health", "Capital", "Financial", "Pacific", "Atlantic", "Federal",
  "Consolidated", "Universal", "Advanced", "Applied", "Texas", "Republic", "Dominion", "Constellation", "Live", "News",
  "Match", "Block", "Ball", "Discovery", "Equity", "Realty", "Life", "Arch", "Charter", "Union", "Corning", "Expand",
  "Quest", "Fair", "Cooper", "Hartford", "Principal", "Regions", "State", "Citizens", "Huntington", "Lincoln", "Simon",
  "Prudential", "Progressive", "Dollar", "Best", "Booking", "Monster", "Marathon", "Trade", "Kinder", "Jack", "Steel",
  "Super", "Smart", "Rocket", "Penguin", "Carrier", "Target", "Gap", "Delta", "Southwest", "Edison", "Xcel", "Entergy",
]);
/** Capitalized words that are also tickers but almost never mean the company in a headline. */
const NOT_TICKERS = new Set(["CEO", "CFO", "AI", "IPO", "ETF", "GDP", "CPI", "FED", "USA", "NYSE", "SEC", "FDA", "EV", "ON", "IT", "ALL", "NOW", "BIG", "WELL", "KEY", "OKE", "CNBC"]);
/** Prefer one share class when two tickers share a company name. */
const PREFERRED: Record<string, string> = { GOOG: "GOOGL", "BRK-A": "BRK-B", FOX: "FOXA", NWS: "NWSA" };

interface Alias {
  symbol: string;
  re: RegExp;
  len: number;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const preferred = (market: MarketFile, s: string) => (PREFERRED[s] && market.t[PREFERRED[s]] ? PREFERRED[s] : s);

export function buildNameIndex(market: MarketFile): Alias[] {
  const byName = new Map<string, string>();
  for (const [symbol, t] of Object.entries(market.t)) {
    if (t.k !== "s") continue;
    const name = shortName(t.n);
    if (name.length < 3) continue;
    byName.set(name, preferred(market, byName.get(name) ?? symbol));
  }
  const firstCounts = new Map<string, number>();
  for (const name of byName.keys()) {
    const first = name.split(" ")[0];
    firstCounts.set(first, (firstCounts.get(first) ?? 0) + 1);
  }
  const aliases: Alias[] = [];
  for (const [name, symbol] of byName) {
    const forms = new Set<string>([name]);
    const first = name.split(" ")[0].replace(/[,.]$/, "");
    if (first !== name && first.length >= 4 && !GENERIC_FIRST.has(first) && firstCounts.get(first) === 1) forms.add(first);
    for (const f of forms) aliases.push({ symbol, re: new RegExp(`(?<![\\w])${escape(f)}(?![\\w])`, "i"), len: f.length });
  }
  return aliases.sort((a, b) => b.len - a.len);
}

export function matchHeadline(title: string, market: MarketFile, index: Alias[]): string[] {
  const found: string[] = [];
  const push = (sym: string) => {
    const s = preferred(market, sym);
    if (market.t[s]?.k === "s" && !found.includes(s)) found.push(s);
  };
  for (const m of title.matchAll(/\(([A-Z]{1,5}(?:[.-][A-Z])?)\)|\$([A-Z]{1,5})\b/g)) push((m[1] ?? m[2]).replace(".", "-"));
  for (const m of title.matchAll(/(?<![\w$])([A-Z]{3,5})(?![\w])/g)) if (!NOT_TICKERS.has(m[1])) push(m[1]);
  for (const a of index) {
    if (found.length >= 2) break;
    if (found.includes(a.symbol)) continue;
    const m = a.re.exec(title);
    // Must read as a proper noun, so "block" or "target" in lower case doesn't count.
    if (m && /[A-Z]/.test(m[0][0])) found.push(a.symbol);
  }
  return found.slice(0, 2);
}

export interface Suggestion {
  symbol: string;
  name: string;
  title: string;
  link: string;
  date: string;
  segment?: string;
}

export function headlineSuggestions(news: NewsItem[], market: MarketFile, calls: CramerCall[], limit = 3): Suggestion[] {
  const index = buildNameIndex(market);
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  for (const n of [...news].sort((a, b) => b.date.localeCompare(a.date))) {
    const date = etDate(new Date(n.date));
    for (const symbol of matchHeadline(n.title, market, index)) {
      if (seen.has(symbol)) continue;
      if (calls.some((c) => c.symbol === symbol && c.date >= date)) continue;
      seen.add(symbol);
      out.push({
        symbol,
        name: shortName(market.t[symbol].n),
        title: n.title,
        link: n.link,
        date,
        segment: /lightning round/i.test(n.title) ? "Lightning Round" : /\binterview|\bCEO\b/i.test(n.title) ? "Interview" : undefined,
      });
      if (out.length >= limit) return out;
    }
  }
  return out;
}
