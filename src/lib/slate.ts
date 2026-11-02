// Builds the board of matchups from the Mad Money feed (news.json) and CNBC's stock tags.
import type { MarketFile, NewsFile } from "./marketTypes";
import { type Side, gameId } from "./game";

export interface SlateStock {
  id: string;
  s: string;
  /** short company name */
  n: string;
  air: string;
  title: string;
  link: string;
  /** CNBC marked it the segment's main stock */
  primary: boolean;
  /** the headline names it */
  named: boolean;
  /** has price data, so it can be scored */
  playable: boolean;
  /** a side read from the headline; only a suggestion until Marc confirms it */
  suggest?: Side;
  /** move since the show aired, as a fraction (from the data job) */
  since?: number;
}

export interface SlateSegment {
  title: string;
  link: string;
  date: string;
  lightning: boolean;
  stocks: SlateStock[];
}

export interface ShowNight {
  air: string;
  segments: SlateSegment[];
}

const SUFFIX =
  /(,?\s+(inc\.?|incorporated|corporation|corp\.?|company|co\.?|ltd\.?|limited|plc|n\.?v\.?|s\.?a\.?|ag|se|l\.?p\.?|holdings?|group|class [a-c]\b.*|common stock|ordinary shares|\(the\)))+$/i;

export function shortName(name: string | undefined, symbol: string): string {
  const raw = (name ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return symbol;
  let s = raw;
  for (let i = 0; i < 3; i++) s = s.replace(SUFFIX, "").trim();
  s = s.replace(/^the\s+/i, "").replace(/,$/, "");
  return s || raw;
}

/** First words too common to identify a company on their own. */
const GENERIC = new Set(
  "the first american general united national international global new bank energy digital advanced applied royal southern western eastern north south texas pacific atlantic us u.s. sk old".split(" "),
);

/** One-word company names that are also everyday words ("price target", "on the block"). */
const COMMON_WORDS = new Set(
  "target block visa snap square gap ball box edge fair shift unity lumen chewy carrier match zoom ford dollar progressive allstate equity insight".split(" "),
);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Does the headline name this stock? By ticker (3+ letters, in capitals), or by company name: the
 * whole name for one-word names, or the first two words for longer ones ("Best Buy", not "best").
 */
export function headlineNames(title: string, symbol: string, names: (string | undefined)[]): boolean {
  if (symbol.length >= 3 && new RegExp(`(^|[^A-Za-z])${escapeRe(symbol)}([^A-Za-z]|$)`).test(title)) return true;
  for (const name of names) {
    const words = shortName(name, "")
      .split(/\s+/)
      .map((w) => w.replace(/[^\p{L}\p{N}&.'-]/gu, ""))
      .filter(Boolean);
    if (!words.length) continue;
    let key: string;
    if (words.length === 1) {
      if (COMMON_WORDS.has(words[0].toLowerCase())) continue;
      key = words[0];
    } else if (GENERIC.has(words[0].toLowerCase())) {
      key = words.slice(0, 3).join(" ");
    } else {
      key = words.slice(0, 2).join(" ");
    }
    if (key.length < 3) continue;
    if (new RegExp(`(^|[^\\p{L}])${escapeRe(key)}('s|’s)?([^\\p{L}]|$)`, "iu").test(title)) return true;
  }
  return false;
}

const SELL_OFF = /\bsell[- ]?offs?\b/gi;
const NEGATED = /\b(do not|don['’]t|not a|never|isn['’]t a)\s+(buy|own)\w*/gi;
const BEAR = /\b(sell|selling|avoid|bearish|stay away|steer clear|do not own|don['’]t own|do not buy|don['’]t buy|not a buy|too risky|overvalued|losers?)\b/i;
const BULL = /\b(buy|buying|buys|likes|loves|bullish|winners?|greatest|favorite|top pick|worth owning)\b/i;
const AMBIGUOUS = /\b(the one|which|versus|vs\.?|plus|or)\b/i;

/** Reads a clear Bull or Bear cue from a headline, or null when it's mixed or unclear. */
export function headlineCue(title: string): Side | null {
  const t = title.replace(SELL_OFF, "");
  if (AMBIGUOUS.test(t)) return null;
  const bear = BEAR.test(t);
  const bull = BULL.test(t.replace(NEGATED, ""));
  if (bull === bear) return null;
  return bull ? "bull" : "bear";
}

const isLightning = (title: string) => /lightning round/i.test(title);
/** Looks like a listed US ticker (CNBC also tags private companies such as "OPENAI-FG"). */
const looksListed = (s: string) => /^[A-Z]{1,5}(-[A-Z])?$/.test(s);

export function buildSlate(news: NewsFile, market: MarketFile): ShowNight[] {
  type Cand = { stock: SlateStock; rank: number; order: number };
  const nights = new Map<string, Map<string, Cand>>();
  const segOrder = new Map<string, number>();
  const segs = new Map<string, SlateSegment>();

  (news.items ?? []).forEach((item, order) => {
    if (!item.air || !item.tk?.length) return;
    const lightning = isLightning(item.title);
    const cue = headlineCue(item.title);
    const tags = item.tk.filter((tag) => {
      const info = market.t[tag.s];
      if (info) return info.k === "s";
      return looksListed(tag.s);
    });
    const named = new Set(
      tags.filter((tag) => headlineNames(item.title, tag.s, [tag.n, market.t[tag.s]?.n])).map((tag) => tag.s),
    );
    const suggestFor = (s: string, primary: boolean): Side | undefined => {
      if (!cue) return undefined;
      if (named.size === 1) return named.has(s) ? cue : undefined;
      if (named.size === 0 && !lightning && primary) return cue;
      return undefined;
    };
    const key = item.link;
    segOrder.set(key, order);
    segs.set(key, { title: item.title, link: item.link, date: item.date, lightning, stocks: [] });
    let night = nights.get(item.air);
    if (!night) {
      night = new Map();
      nights.set(item.air, night);
    }
    for (const tag of tags) {
      const info = market.t[tag.s];
      const primary = tag.p === 1;
      const isNamed = named.has(tag.s);
      const stock: SlateStock = {
        id: gameId(item.air, tag.s),
        s: tag.s,
        n: shortName(info?.n ?? tag.n, tag.s),
        air: item.air,
        title: item.title,
        link: item.link,
        primary,
        named: isNamed,
        playable: Boolean(info),
        suggest: suggestFor(tag.s, primary),
        since: Number.isFinite(tag.m) ? tag.m : undefined,
      };
      // One matchup per stock per show; prefer the segment that's about it.
      const rank = (isNamed ? 2 : 0) + (primary ? 1 : 0);
      const prev = night.get(tag.s);
      if (!prev || rank > prev.rank) night.set(tag.s, { stock, rank, order });
    }
  });

  const out: ShowNight[] = [];
  for (const [air, night] of nights) {
    const bySeg = new Map<string, SlateStock[]>();
    for (const { stock } of night.values()) {
      const list = bySeg.get(stock.link) ?? [];
      list.push(stock);
      bySeg.set(stock.link, list);
    }
    const segments: SlateSegment[] = [];
    for (const [link, stocks] of bySeg) {
      const seg = segs.get(link)!;
      stocks.sort((a, b) => Number(b.named) - Number(a.named) || Number(b.primary) - Number(a.primary));
      segments.push({ ...seg, stocks });
    }
    segments.sort((a, b) => (segOrder.get(a.link) ?? 0) - (segOrder.get(b.link) ?? 0));
    out.push({ air, segments });
  }
  return out.sort((a, b) => b.air.localeCompare(a.air));
}

/** Every slate stock by id. */
export function slateIndex(nights: ShowNight[]): Map<string, SlateStock> {
  const map = new Map<string, SlateStock>();
  for (const night of nights) for (const seg of night.segments) for (const s of seg.stocks) map.set(s.id, s);
  return map;
}
