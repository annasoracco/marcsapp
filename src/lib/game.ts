// Matchups and scoring. Pure functions; no React.
//
// The rule, in plain words (also shown in the app):
//   A matchup kicks off at the first market close after Marc locks in his pick and goes final
//   five trading days later. Bull wins if the stock beats the S&P 500 (SPY, dividends included)
//   over that stretch; Bear wins if it trails. Cramer is scored on the same stretch.
import type { Series, TickerInfo } from "./marketTypes";
import { etDate, etDateFromEpoch, etMinutes, etMinutesFromEpoch, isWeekday, mondayOf, nextWeekday } from "./dates";
import { indexOnOrAfter, indexOnOrBefore } from "./history";

export type Side = "bull" | "bear";
export type Result = "W" | "L" | "T";

/** Trading days from kickoff to the final whistle. */
export const GAME_DAYS = 5;
/** The benchmark every matchup is measured against. */
export const BENCH = "SPY";
const CLOSE_MINUTES = 16 * 60;
/** Margins smaller than this (0.005 percentage points) count as a tie. */
const TIE_EPSILON = 0.00005;

/** A settled result, saved so a season survives even after old price files roll off. */
export interface Final {
  /** kickoff date (the close the matchup is measured from) */
  k: string;
  /** final whistle date */
  e: string;
  /** stock return over the matchup (fraction) */
  sr: number;
  /** S&P 500 (SPY) return over the matchup (fraction) */
  br: number;
}

export interface Game {
  /** `${air}|${symbol}` */
  id: string;
  s: string;
  /** company name */
  n: string;
  /** show date (YYYY-MM-DD) */
  air: string;
  title: string;
  link: string;
  cramer: Side;
  marc: Side;
  /** when Marc locked the pick (ISO) */
  at: string;
  /** the first trading day whose close is after `at` (weekends skipped; holidays resolve against market data) */
  kick: string;
  fin?: Final;
}

export function gameId(air: string, symbol: string): string {
  return `${air}|${symbol}`;
}

/** The first weekday close strictly after `at` (US/Eastern). */
export function kickoffDate(at: Date): string {
  const d = etDate(at);
  if (isWeekday(d) && etMinutes(at) < CLOSE_MINUTES) return d;
  return nextWeekday(d);
}

/** True while a pick can still be changed: before its kickoff close, judged by the clock, not by data. */
export function isBeforeKickoff(game: Pick<Game, "kick">, now: Date): boolean {
  return kickoffDate(now) <= game.kick;
}

/** The S&P 500 trading calendar, plus how far its closes are final. */
export interface Calendar {
  dates: string[];
  closes: number[];
  /** index of the latest close that is final (the market had closed) */
  lastFinal: number;
}

/** Weekdays strictly between two dates. */
function weekdaysBetween(a: string, b: string): number {
  let n = 0;
  for (let d = nextWeekday(a); d < b; d = nextWeekday(d)) n++;
  return n;
}

const quoteIsBeforeClose = (quote: TickerInfo, date: string) =>
  etDateFromEpoch(quote.t!) === date && etMinutesFromEpoch(quote.t!) < CLOSE_MINUTES;

/**
 * `spy` should already include the latest quote (see withQuote). Only closes at or before the latest
 * post-close SPY quote count as final. If the price history is stale, the quote's bar is left out so
 * missing sessions are never collapsed into one trading day.
 */
export function makeCalendar(spy: Series, quote: TickerInfo | undefined): Calendar {
  let { dates, closes } = spy;
  const n = dates.length;
  if (!n) return { dates, closes, lastFinal: -1 };
  if (!quote?.t) return { dates, closes, lastFinal: n - 2 };
  const qDate = etDateFromEpoch(quote.t);
  if (qDate === dates[n - 1] && n >= 2 && weekdaysBetween(dates[n - 2], qDate) > 0) {
    dates = dates.slice(0, -1);
    closes = closes.slice(0, -1);
    return { dates, closes, lastFinal: dates.length - 1 };
  }
  let lastFinal = n - 1;
  if (quoteIsBeforeClose(quote, dates[lastFinal])) lastFinal--;
  return { dates, closes, lastFinal };
}

export type GameState =
  | { kind: "loading" }
  /** prices are sample data, so nothing is scored */
  | { kind: "paused" }
  | { kind: "pending"; kick: string }
  | { kind: "nodata"; kick: string }
  | { kind: "live"; kick: string; day: number; sr: number; br: number }
  | { kind: "final"; fin: Final };

function closeOn(series: Series, date: string, maxGapDays = 7): number | null {
  const i = indexOnOrBefore(series, date);
  if (i < 0) return null;
  const gap = (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${series.dates[i]}T12:00:00Z`)) / 86400000;
  if (gap > maxGapDays) return null;
  const c = series.closes[i];
  return Number.isFinite(c) && c > 0 ? c : null;
}

/** The stock's own close on exactly `date`, or null if it has no final bar for that day yet. */
function finalCloseOn(series: Series, date: string, quote: TickerInfo | undefined): number | null {
  const i = indexOnOrBefore(series, date);
  if (i < 0 || series.dates[i] !== date) return null;
  if (quote?.t && quoteIsBeforeClose(quote, date)) return null;
  const c = series.closes[i];
  return Number.isFinite(c) && c > 0 ? c : null;
}

/**
 * Where a matchup stands. `stock` is undefined while its prices load and null when there are none.
 * A matchup only goes final when both the S&P 500 and the stock have a real closing price for the
 * final day; until then it stays live.
 */
export function evaluate(
  game: Game,
  cal: Calendar | null | undefined,
  stock: Series | null | undefined,
  stockQuote?: TickerInfo,
): GameState {
  if (game.fin) return { kind: "final", fin: game.fin };
  if (!cal) return { kind: "loading" };
  const k = indexOnOrAfter(cal.dates, game.kick);
  if (k < 0 || k > cal.lastFinal) return { kind: "pending", kick: k < 0 ? game.kick : cal.dates[k] };
  const kick = cal.dates[k];
  if (stock === undefined) return { kind: "loading" };
  const startPrice = stock && closeOn(stock, kick);
  if (!stock || !startPrice) return { kind: "nodata", kick };
  const end = k + GAME_DAYS;
  const cur = Math.min(end, cal.dates.length - 1);
  const nowPrice = closeOn(stock, cal.dates[cur]);
  if (!nowPrice) return { kind: "nodata", kick };
  const br = cal.closes[cur] / cal.closes[k] - 1;
  if (end <= cal.lastFinal) {
    const endPrice = finalCloseOn(stock, cal.dates[end], stockQuote);
    if (endPrice) return { kind: "final", fin: { k: kick, e: cal.dates[end], sr: endPrice / startPrice - 1, br } };
  }
  return { kind: "live", kick, day: cur - k, sr: nowPrice / startPrice - 1, br };
}

/** Which side is winning (or won): Bull if the stock beats the S&P 500, Bear if it trails. */
export function leadingSide(sr: number, br: number): Side | null {
  const edge = sr - br;
  if (Math.abs(edge) < TIE_EPSILON) return null;
  return edge > 0 ? "bull" : "bear";
}

export function resultFor(side: Side, sr: number, br: number): Result {
  const w = leadingSide(sr, br);
  if (!w) return "T";
  return w === side ? "W" : "L";
}

export interface TeamRecord {
  w: number;
  l: number;
  t: number;
  /** e.g. { r: "W", n: 3 }; ties don't count toward or break a streak */
  streak: { r: "W" | "L"; n: number } | null;
  /** most recent results, oldest first (up to 10) */
  last: Result[];
}

export interface Standings {
  marc: TeamRecord;
  cramer: TeamRecord;
  /** decided matchups where Marc and Cramer took opposite sides */
  h2h: { marc: number; cramer: number };
  games: number;
}

export type FinalGame = Game & { fin: Final };

/** Finals in the order they happened: by final whistle, then kickoff, then id. */
export function byFinish(a: FinalGame, b: FinalGame): number {
  return a.fin.e.localeCompare(b.fin.e) || a.fin.k.localeCompare(b.fin.k) || a.id.localeCompare(b.id);
}

function record(results: Result[]): TeamRecord {
  const rec: TeamRecord = { w: 0, l: 0, t: 0, streak: null, last: results.slice(-10) };
  for (const r of results) {
    if (r === "W") rec.w++;
    else if (r === "L") rec.l++;
    else rec.t++;
  }
  for (let i = results.length - 1; i >= 0; i--) {
    const r = results[i];
    if (r === "T") continue;
    if (!rec.streak) rec.streak = { r, n: 1 };
    else if (rec.streak.r === r) rec.streak.n++;
    else break;
  }
  return rec;
}

export function standings(finals: FinalGame[]): Standings {
  const sorted = [...finals].sort(byFinish);
  const marc: Result[] = [];
  const cramer: Result[] = [];
  const h2h = { marc: 0, cramer: 0 };
  for (const g of sorted) {
    const m = resultFor(g.marc, g.fin.sr, g.fin.br);
    const c = resultFor(g.cramer, g.fin.sr, g.fin.br);
    marc.push(m);
    cramer.push(c);
    if (g.marc !== g.cramer && m !== "T") {
      if (m === "W") h2h.marc++;
      else h2h.cramer++;
    }
  }
  return { marc: record(marc), cramer: record(cramer), h2h, games: sorted.length };
}

/** Season = calendar year of kickoff. */
export function seasonOf(kick: string): number {
  return Number(kick.slice(0, 4));
}

/** Week 1 is the week of the season's first kickoff. Returns 1-based week number. */
export function weekNumber(firstKick: string, kick: string): number {
  const a = Date.parse(`${mondayOf(firstKick)}T12:00:00Z`);
  const b = Date.parse(`${mondayOf(kick)}T12:00:00Z`);
  return Math.floor((b - a) / (7 * 86400000)) + 1;
}

export interface WeekLine {
  week: number;
  monday: string;
  marc: { w: number; l: number; t: number };
  cramer: { w: number; l: number; t: number };
}

/** Week-by-week records for one season's finals, newest week first. Week 1 is the week of `firstKick`. */
export function weekByWeek(finals: FinalGame[], firstKick?: string): WeekLine[] {
  if (!finals.length) return [];
  const first = firstKick ?? finals.map((g) => g.fin.k).sort()[0];
  const weeks = new Map<number, WeekLine>();
  for (const g of finals) {
    const week = weekNumber(first, g.fin.k);
    let line = weeks.get(week);
    if (!line) {
      line = { week, monday: mondayOf(g.fin.k), marc: { w: 0, l: 0, t: 0 }, cramer: { w: 0, l: 0, t: 0 } };
      weeks.set(week, line);
    }
    const bump = (rec: { w: number; l: number; t: number }, r: Result) => {
      if (r === "W") rec.w++;
      else if (r === "L") rec.l++;
      else rec.t++;
    };
    bump(line.marc, resultFor(g.marc, g.fin.sr, g.fin.br));
    bump(line.cramer, resultFor(g.cramer, g.fin.sr, g.fin.br));
  }
  return [...weeks.values()].sort((a, b) => b.week - a.week);
}
