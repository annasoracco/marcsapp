// Plain-English, rule-based insight generators. Deterministic, market-level, and personal-data free.
import type { MarketFile } from "./marketTypes";
import type { CallResult, Scorecard } from "./calls";
import { ACTION_LABEL } from "./calls";
import { daysBetween, etDateFromEpoch, etMinutesFromEpoch, addDays } from "./dates";
import { shortDate } from "./format";
import { shortName } from "./names";

export const SECTOR_ETFS: Record<string, string> = {
  XLK: "Information Technology",
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

/** How sectors read inside a sentence. */
export const SECTOR_WORD: Record<string, string> = {
  "Information Technology": "tech",
  Financials: "financials",
  "Health Care": "health care",
  "Consumer Discretionary": "consumer discretionary",
  "Consumer Staples": "consumer staples",
  Energy: "energy",
  Industrials: "industrials",
  Materials: "materials",
  Utilities: "utilities",
  "Real Estate": "real estate",
  "Communication Services": "communication services",
};

/** Short sector names for compact lists. */
export const SECTOR_SHORT: Record<string, string> = {
  "Information Technology": "Tech",
  Financials: "Financials",
  "Health Care": "Health care",
  "Consumer Discretionary": "Discretionary",
  "Consumer Staples": "Staples",
  Energy: "Energy",
  Industrials: "Industrials",
  Materials: "Materials",
  Utilities: "Utilities",
  "Real Estate": "Real estate",
  "Communication Services": "Communication",
};

export const INDEX_NAMES: Record<string, string> = {
  "^GSPC": "S&P 500",
  "^IXIC": "Nasdaq",
  "^DJI": "Dow",
  "^RUT": "Russell 2000",
  "^VIX": "VIX",
};

/** "1.4%" for sentences: one decimal, no sign. */
export function p1(x: number): string {
  const v = Math.abs(x * 100);
  return `${v < 0.05 ? "0" : v.toFixed(1)}%`;
}

/** Whole-number percent, "<1%" for tiny slices. */
export function p0(x: number): string {
  const v = x * 100;
  if (v > 0 && v < 0.5) return "<1%";
  return `${Math.round(v)}%`;
}

export function signed1(x: number | null | undefined): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "\u2014";
  const v = x * 100;
  if (Math.abs(v) < 0.05) return "0.0%";
  return `${v > 0 ? "+" : "\u2212"}${Math.abs(v).toFixed(1)}%`;
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function joinAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

// ---------- the market's day ----------

export interface SectorMove {
  sector: string;
  change: number;
}

/** "Rough day for tech", "Quiet day for stocks", "Strong day for energy". */
export function marketMood(sp: number, sectors: SectorMove[]): string {
  const word = sp >= 0.01 ? "Strong day" : sp >= 0.003 ? "Good day" : sp > -0.003 ? "Quiet day" : sp > -0.01 ? "Soft day" : "Rough day";
  if (Math.abs(sp) < 0.003 || sectors.length === 0) return `${word} for stocks`;
  const lead = sectors.filter((s) => Math.sign(s.change) === Math.sign(sp)).sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
  if (lead && Math.abs(lead.change) >= 0.01 && Math.abs(lead.change) >= 1.5 * Math.abs(sp)) {
    return `${word} for ${SECTOR_WORD[lead.sector] ?? lead.sector.toLowerCase()}`;
  }
  return `${word} for stocks`;
}

export interface Mover {
  symbol: string;
  name: string;
  sector: string;
  /** Contribution to the S&P 500's move, as a fraction (0.0042 = 0.42 percentage points). */
  pts: number;
  change: number;
}

/**
 * Approximate contributions to the S&P 500's move: each member's share of total market cap
 * times its % change today. Uses public market caps only.
 */
export function indexMovers(market: MarketFile): Mover[] {
  const members = Object.entries(market.t).filter(([, t]) => t.k === "s" && t.sp && t.mc && Number.isFinite(t.c));
  const total = members.reduce((a, [, t]) => a + (t.mc ?? 0), 0);
  if (total <= 0) return [];
  return members
    .map(([symbol, t]) => ({ symbol, name: shortName(t.n), sector: t.sec ?? "Other", change: t.c, pts: ((t.mc ?? 0) / total) * t.c }))
    .sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));
}

/** Each member's weight in the S&P 500 by market cap. */
export function indexWeights(market: MarketFile): Map<string, number> {
  const members = Object.entries(market.t).filter(([, t]) => t.k === "s" && t.sp && t.mc);
  const total = members.reduce((a, [, t]) => a + (t.mc ?? 0), 0);
  return new Map(members.map(([s, t]) => [s, total > 0 ? (t.mc ?? 0) / total : 0]));
}

/**
 * The Briefing's opening sentences, e.g.
 * "Rough day for tech. The S&P 500 fell 1.8%, dragged by Nvidia and Broadcom."
 * `pastDay` names the session when the latest close isn't today ("Friday").
 */
export function briefingHeadline(args: { mood: string; sp: number; movers: Mover[]; pastDay?: string }): string {
  const { mood, sp, movers, pastDay } = args;
  const first = pastDay ? `${pastDay} was a ${mood.charAt(0).toLowerCase()}${mood.slice(1)}.` : `${mood}.`;
  const verb = sp >= 0.0005 ? "rose" : sp <= -0.0005 ? "fell" : "was flat";
  const move = verb === "was flat" ? "The S&P 500 was about flat" : `The S&P 500 ${verb} ${p1(sp)}`;
  const leaders = movers.filter((m) => Math.sign(m.pts) === Math.sign(sp)).slice(0, 2);
  if (verb === "was flat" || leaders.length === 0) return `${first} ${move}.`;
  return `${first} ${move}, ${sp < 0 ? "dragged" : "lifted"} by ${joinAnd(leaders.map((m) => m.name))}.`;
}

/** "Tech did most of the dragging. Nvidia, Broadcom and Apple pulled hardest; Exxon Mobil pushed back." */
export function moversSummary(movers: Mover[], sp: number): string | null {
  if (!movers.length || Math.abs(sp) < 0.0005) return movers.length ? "A quiet session, with no big pushes either way." : null;
  const down = sp < 0;
  const bySector = new Map<string, number>();
  for (const m of movers) bySector.set(m.sector, (bySector.get(m.sector) ?? 0) + m.pts);
  const net = [...bySector.values()].reduce((a, b) => a + b, 0);
  const lead = [...bySector.entries()].filter(([, v]) => Math.sign(v) === Math.sign(net)).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
  const parts: string[] = [];
  if (lead && Math.abs(lead[1]) >= 0.4 * Math.abs(net)) {
    parts.push(`${cap(SECTOR_WORD[lead[0]] ?? lead[0])} did most of the ${down ? "dragging" : "lifting"}.`);
  } else {
    parts.push(`The ${down ? "drop" : "gain"} was spread across sectors.`);
  }
  const same = movers.filter((m) => Math.sign(m.pts) === Math.sign(sp)).slice(0, 3);
  const against = movers.filter((m) => Math.sign(m.pts) === -Math.sign(sp)).slice(0, 2);
  const sameSum = same.reduce((a, m) => a + Math.abs(m.pts), 0);
  const againstSum = against.reduce((a, m) => a + Math.abs(m.pts), 0);
  let s = `${joinAnd(same.map((m) => m.name))} ${down ? "pulled" : "pushed"} hardest`;
  if (against.length && againstSum >= 0.15 * sameSum) s += `; ${joinAnd(against.map((m) => m.name))} ${down ? "pushed back" : "held it back"}`;
  parts.push(`${s}.`);
  return parts.join(" ");
}

// ---------- earnings ----------

export type Tag = "Watching" | "Cramer call";

export interface EarningsItem {
  symbol: string;
  name: string;
  date: string;
  timing: "Before open" | "After close" | "During market" | "Time TBD";
  estimate: boolean;
  tags: Tag[];
  mc: number;
}

export function earningsTiming(e: number, ec?: number): EarningsItem["timing"] {
  const mins = etMinutesFromEpoch(ec ?? e);
  if (!ec && mins === 0) return "Time TBD";
  if (mins < 9 * 60 + 30) return "Before open";
  if (mins >= 16 * 60) return "After close";
  return ec ? "During market" : "Time TBD";
}

/** Upcoming reports for covered stocks within the window, tagged by Marc's watchlist and calls. */
export function upcomingEarnings(market: MarketFile, tags: Map<string, Set<Tag>>, today: string, horizonDays: number): EarningsItem[] {
  const end = addDays(today, horizonDays);
  const out: EarningsItem[] = [];
  for (const [symbol, q] of Object.entries(market.t)) {
    if (q.k !== "s" || !q.e) continue;
    const date = etDateFromEpoch(q.e);
    if (date < today || date > end) continue;
    out.push({ symbol, name: shortName(q.n), date, timing: earningsTiming(q.e, q.ec), estimate: q.est === 1, tags: [...(tags.get(symbol) ?? [])], mc: q.mc ?? 0 });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || b.mc - a.mc);
}

const WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" });

export function whenLabel(date: string, today: string): string {
  const n = daysBetween(today, date);
  if (n <= 0) return "today";
  if (n === 1) return "tomorrow";
  if (n <= 6) return WEEKDAY.format(new Date(`${date}T12:00:00Z`));
  return shortDate(date);
}

export interface BigReport {
  symbol: string;
  title: string;
  context: string;
  date: string;
  rank: number;
}

/** "Big reports this week": watchlist and Cramer tickers first, then the largest companies. */
export function bigReports(args: {
  earnings: EarningsItem[];
  weights: Map<string, number>;
  callResults: CallResult[];
  watchReturns: Record<string, number | null | undefined>;
  today: string;
  limit?: number;
}): BigReport[] {
  const { earnings, weights, callResults, watchReturns, today, limit = 5 } = args;
  const out: BigReport[] = [];
  for (const e of earnings) {
    const weekend = [0, 6].includes(new Date(`${e.date}T12:00:00Z`).getUTCDay());
    const timing = weekend ? "" : e.timing === "After close" ? " after the close" : e.timing === "Before open" ? " before the open" : "";
    const title = `${e.symbol} reports ${whenLabel(e.date, today)}${timing}`;
    const w = weights.get(e.symbol) ?? 0;
    let context = "";
    let rank = 2;
    if (e.tags.includes("Watching")) {
      const r = watchReturns[e.symbol];
      context = typeof r === "number" ? `You're watching it. It's ${r >= 0 ? "up" : "down"} ${p1(r)} since you added it.` : "You're watching it.";
      rank = 0;
    } else if (e.tags.includes("Cramer call")) {
      const latest = callResults.filter((r) => r.call.symbol === e.symbol).sort((a, b) => b.call.date.localeCompare(a.call.date))[0];
      if (latest) {
        const said = `Cramer said ${ACTION_LABEL[latest.call.action]} on ${shortDate(latest.call.date)}`;
        context =
          latest.status === "ok" && latest.excess !== undefined
            ? `${said}. It has ${latest.excess >= 0 ? "beaten" : "trailed"} the market by ${p1(latest.excess)} since.`
            : `${said}.`;
      }
      rank = 1;
    } else if (w >= 0.005) {
      context = `${e.name} is about ${p1(w)} of the S&P 500, so its report can move the whole market.`;
    } else if (e.mc >= 100) {
      context = `${e.name} is one of the bigger companies reporting this week.`;
    } else continue;
    out.push({ symbol: e.symbol, title, context, date: e.date, rank });
  }
  return out
    .sort((a, b) => a.rank - b.rank || (weights.get(b.symbol) ?? 0) - (weights.get(a.symbol) ?? 0) || a.date.localeCompare(b.date))
    .slice(0, limit);
}

// ---------- Cramer ----------

export function cramerCheck(score: Scorecard, total: number): string {
  if (total === 0) return "You're not tracking any of Cramer's calls yet.";
  if (score.graded === 0) return "Your calls get scored after their first close. Check back tomorrow.";
  return `Of the ${score.graded} calls you're tracking, ${score.right} ${score.right === 1 ? "was" : "were"} right.`;
}

export type Strategy = "follow" | "inverse" | "market";

export interface Verdict {
  winner: Strategy | null;
  answer: string;
  bars: { key: Strategy; label: string; value: number | null }[];
}

export function cramerVerdict(score: Scorecard): Verdict {
  const bars: Verdict["bars"] = [
    { key: "follow", label: "Follow Cramer", value: score.avgFollow },
    { key: "inverse", label: "Do the opposite", value: score.avgInverse },
    { key: "market", label: "Just buy the S&P", value: score.avgMarket },
  ];
  if (!score.graded || score.avgFollow === null || score.avgInverse === null || score.avgMarket === null) {
    return { winner: null, answer: "Log a few calls and check back. Each call is scored from the close on the day it aired.", bars };
  }
  const winner = [...bars].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))[0].key;
  const f = signed1(score.avgFollow);
  const m = signed1(score.avgMarket);
  const i = signed1(score.avgInverse);
  const answer =
    winner === "follow"
      ? `Yes, so far. Following his calls made ${f} per call on average, vs ${m} for just buying the S&P.`
      : winner === "market"
        ? `Not so far. Just buying the S&P made ${m} per call on average. Following him made ${f}.`
        : `No. Doing the opposite of his calls would have done best, ${i} per call on average.`;
  return { winner, answer, bars };
}

/** "Beat the market by 7.6%" / "Trailed the market by 9.0%" */
export function vsMarketPhrase(excess: number): string {
  return `${excess >= 0 ? "Beat" : "Trailed"} the market by ${p1(excess)}`;
}

/** One-sentence story for a single call. */
export function callStory(r: CallResult): string {
  const said = `Cramer said ${ACTION_LABEL[r.call.action]} on ${shortDate(r.call.date)}.`;
  if (r.status === "pending") return `${said} Scoring starts after that day's close.`;
  if (r.status === "tooold") return `${said} That's before the price history starts, so it can't be scored.`;
  if (r.status === "uncovered") return `${said} ${r.call.symbol} isn't covered yet, so it can't be scored.`;
  if (r.status !== "ok" || r.excess === undefined) return said;
  const phrase = vsMarketPhrase(r.excess);
  const moved = `${r.call.symbol} ${phrase.charAt(0).toLowerCase()}${phrase.slice(1)} since`;
  if (r.call.action === "hold") return `${said} ${moved}. Holds aren't scored.`;
  return `${said} ${moved}, so this one ${r.right ? "was right" : "missed"}.`;
}
