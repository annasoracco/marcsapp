import type { MarketFile } from "./marketTypes";
import type { CombinedPosition } from "./xray";
import { etDateFromEpoch, etMinutesFromEpoch, todayET, addDays } from "./dates";

/** Weighted % change today across positions with live prices (cash counts as flat). */
export function portfolioChange(positions: CombinedPosition[], market: MarketFile): { change: number | null; coverage: number } {
  let num = 0;
  let den = 0;
  let total = 0;
  for (const p of positions) {
    total += p.weight;
    if (p.type === "Cash") {
      den += p.weight;
      continue;
    }
    const q = p.symbol ? market.t[p.symbol] : undefined;
    if (!q || !Number.isFinite(q.c)) continue;
    num += p.weight * q.c;
    den += p.weight;
  }
  return { change: den > 0 ? num / den : null, coverage: total > 0 ? den / total : 0 };
}

export type Tag = "Holding" | "Watchlist" | "Cramer call";

export interface Mover {
  symbol: string;
  name: string;
  change: number;
  tags: Tag[];
}

export function movers(tags: Map<string, Set<Tag>>, market: MarketFile, n = 5): { up: Mover[]; down: Mover[] } {
  const list: Mover[] = [];
  for (const [symbol, t] of tags) {
    const q = market.t[symbol];
    if (!q || q.k === "m" || !Number.isFinite(q.c)) continue;
    list.push({ symbol, name: q.n, change: q.c, tags: [...t] });
  }
  return {
    up: list.filter((m) => m.change > 0).sort((a, b) => b.change - a.change).slice(0, n),
    down: list.filter((m) => m.change < 0).sort((a, b) => a.change - b.change).slice(0, n),
  };
}

export interface EarningsItem {
  symbol: string;
  name: string;
  date: string;
  timing: "Before open" | "After close" | "During market" | "Time TBD";
  estimate: boolean;
  tags: Tag[];
}

export function upcomingEarnings(tags: Map<string, Set<Tag>>, market: MarketFile, now = new Date(), horizonDays = 90): EarningsItem[] {
  const today = todayET(now);
  const end = addDays(today, horizonDays);
  const out: EarningsItem[] = [];
  for (const [symbol, t] of tags) {
    const q = market.t[symbol];
    if (!q?.e) continue;
    const date = etDateFromEpoch(q.e);
    if (date < today || date > end) continue;
    const ref = q.ec ?? q.e;
    const mins = etMinutesFromEpoch(ref);
    const timing: EarningsItem["timing"] =
      !q.ec && mins === 0 ? "Time TBD" : mins < 9 * 60 + 30 ? "Before open" : mins >= 16 * 60 ? "After close" : q.ec ? "During market" : "Time TBD";
    out.push({ symbol, name: q.n, date, timing, estimate: q.est === 1, tags: [...t] });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.symbol.localeCompare(b.symbol));
}

export const SECTOR_ETF_NAMES: Record<string, string> = {
  XLK: "Technology",
  XLF: "Financials",
  XLV: "Health Care",
  XLY: "Consumer Discretionary",
  XLP: "Consumer Staples",
  XLE: "Energy",
  XLI: "Industrials",
  XLB: "Materials",
  XLU: "Utilities",
  XLRE: "Real Estate",
  XLC: "Communication Services",
};

export const INDEX_NAMES: Record<string, string> = {
  "^GSPC": "S&P 500",
  "^IXIC": "Nasdaq",
  "^DJI": "Dow",
  "^RUT": "Russell 2000",
  "^VIX": "VIX",
};
