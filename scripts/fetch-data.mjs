#!/usr/bin/env node
// Hindsight data job. Writes one static file the app loads at startup: <out>/hindsight.json.
//
//   node scripts/fetch-data.mjs [--out public/data] [--cache .data-cache] [--live-url URL]
//
// Sources: Yahoo Finance daily adjusted closes (via yahoo-finance2, no key), FRED CPIAUCSL (keyless CSV),
// and CNBC's official Mad Money RSS feed plus the stocks CNBC tags on each article.
//
// Never fake data. Each run builds a candidate dataset from one fresh snapshot per asset (falling back to
// that asset's last good snapshot if Yahoo fails), validates it, and only then promotes it. If the candidate
// fails validation, the last good dataset (from the cache, or the live site) is published again unchanged.
// If there is no good dataset at all, nothing is written and the deploy step stops.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bigMoves,
  buildAsset,
  cpiLookup,
  dateInZone,
  encodeDaily,
  monthIndex,
  sig10,
  ymdInt,
} from "./lib/hindsight-core.mjs";

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = path.resolve(opt("out", path.join(ROOT, "public", "data")));
const CACHE = path.resolve(opt("cache", path.join(ROOT, ".data-cache")));
const LIVE_URL = opt("live-url", "https://annasoracco.github.io/marcsapp/data");
const ONLY = opt("only", "");
// --offline: rebuild from cached snapshots only (for development; never used by the workflow).
const OFFLINE = argv.includes("--offline");
const FILE = "hindsight.json";
const MORE_FILE = "hindsight-more.json";
// Bump whenever the encoding changes, so an older "last good" copy is never republished in a format the app can't read.
const FORMAT = 3;
const HISTORY_FROM = new Date("1987-12-01T00:00:00Z");
const CPI_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=CPIAUCSL";
const MAD_MONEY_RSS = "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15838459";
const MENTION_DAYS = 7;
const UA = "marcsapp-data-job/2.0 (+https://github.com/annasoracco/marcsapp)";
const KIND = { EQUITY: "s", ETF: "e", MUTUALFUND: "f", CRYPTOCURRENCY: "c", INDEX: "i" };

const log = (...a) => console.log(`[data ${new Date().toISOString().slice(11, 19)}]`, ...a);
const warn = (msg) => console.log(`::warning::${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fileFor = (symbol) => `${symbol.replace(/\^/g, "_")}.json`;

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function retry(fn, label, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await withTimeout(fn(), 45000, label);
    } catch (e) {
      lastErr = e;
      if (/Not Found|No data found|delisted|404/i.test(String(e?.message ?? e))) break;
      await sleep(1500 * 2 ** i + Math.random() * 500);
    }
  }
  throw new Error(`${label}: ${lastErr?.message ?? lastErr}`);
}

async function pool(items, concurrency, worker) {
  let i = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

function toDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v < 1e11 ? v * 1000 : v);
  if (typeof v === "string") return new Date(v);
  return null;
}

// ---------- Yahoo ----------

let yfPromise;
async function yahoo() {
  yfPromise ??= import("yahoo-finance2").then(
    ({ default: YahooFinance }) => new YahooFinance({ suppressNotices: ["yahooSurvey"] }),
  );
  return yfPromise;
}

/**
 * Daily adjusted closes in the asset's own calendar, with today's still-trading bar removed.
 * Dates come from the exchange's time zone (UTC for crypto), so a bar is labeled with its own trading day.
 */
export async function fetchDaily(symbol, now = new Date()) {
  const yf = await yahoo();
  const res = await retry(
    () => yf.chart(symbol, { period1: HISTORY_FROM, interval: "1d" }, { validateResult: false }),
    `chart ${symbol}`,
  );
  return snapshotFromChart(res, symbol, now);
}

/** Pure half of fetchDaily: a yahoo-finance2 chart() result ({ meta, quotes }) to a daily snapshot. */
export function snapshotFromChart(res, symbol, now = new Date()) {
  const meta = res?.meta ?? {};
  const tz = meta.exchangeTimezoneName || "America/New_York";
  const kind = KIND[meta.instrumentType] ?? "s";
  const byDate = new Map();
  for (const q of res?.quotes ?? []) {
    const d = toDate(q?.date);
    const close = q?.adjclose;
    if (!d || Number.isNaN(d.getTime()) || !Number.isFinite(close) || close <= 0) continue;
    byDate.set(dateInZone(d, tz), sig10(close));
  }
  let dates = [...byDate.keys()].sort();
  const today = dateInZone(now, tz);
  if (kind === "c") {
    // A crypto "day" closes at midnight UTC, so today's bar is always still moving.
    dates = dates.filter((d) => d < today);
  } else if (dates.at(-1) === today) {
    const end = toDate(meta.currentTradingPeriod?.regular?.end);
    const settled = end && now.getTime() > end.getTime() + 15 * 60000;
    if (!settled) dates = dates.slice(0, -1);
  }
  if (dates.length < 20) throw new Error(`chart ${symbol}: only ${dates.length} daily closes`);
  return {
    s: symbol,
    k: kind,
    tz,
    fetchedAt: now.toISOString(),
    dates,
    closes: dates.map((d) => byDate.get(d)),
  };
}

// ---------- FRED CPI ----------

async function fetchCpi() {
  const res = await retry(
    () => fetch(CPI_URL, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(30000) }),
    "cpi",
  );
  if (!res.ok) throw new Error(`CPI HTTP ${res.status}`);
  return parseCpiCsv(await res.text());
}

/** FRED's CPIAUCSL CSV to { m0, b, last, v, filled }, from Jan 1987 on. */
export function parseCpiCsv(text) {
  const rows = text
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.split(","))
    .filter(([d]) => /^\d{4}-\d{2}-01$/.test(d) && d >= "1987-01")
    .map(([d, v]) => [d.slice(0, 7), v === "" || v === "." ? null : Number(v)]);
  while (rows.length && !(rows.at(-1)[1] > 0)) rows.pop();
  if (rows.length < 400) throw new Error(`CPI: only ${rows.length} months`);
  for (let i = 1; i < rows.length; i++) {
    if (monthIndex(rows[i][0]) !== monthIndex(rows[i - 1][0]) + 1) throw new Error(`CPI: gap before ${rows[i][0]}`);
  }
  // BLS never published some months (October 2025, during the federal shutdown). Fill short gaps
  // geometrically between the neighbors and disclose which months were filled.
  const filled = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][1] > 0) continue;
    let j = i;
    while (j < rows.length && !(rows[j][1] > 0)) j++;
    if (i === 0 || j - i > 2) throw new Error(`CPI: missing ${rows[i][0]}`);
    const a = rows[i - 1][1];
    const b = rows[j][1];
    for (let k = i; k < j; k++) {
      rows[k][1] = Number((a * (b / a) ** ((k - i + 1) / (j - i + 1))).toFixed(3));
      filled.push(rows[k][0]);
    }
    i = j;
  }
  return { m0: monthIndex(rows[0][0]), b: rows[0][0], last: rows.at(-1)[0], v: rows.map((r) => r[1]), filled };
}

// ---------- Mad Money mentions ----------

function decodeEntities(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&apos;|&#39;|&#x27;/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, "&")
    .trim();
}

const normalizeSymbol = (raw) =>
  String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/^\$/, "")
    .replace(/\./g, "-");

async function fetchNews() {
  const res = await fetch(MAD_MONEY_RSS, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((m) => {
      const get = (tag) => decodeEntities(m[1].match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? "");
      const date = new Date(get("pubDate"));
      return { title: get("title"), link: get("link"), date: Number.isNaN(date.getTime()) ? null : date.toISOString() };
    })
    .filter((i) => i.title && i.date && /^https:\/\/www\.cnbc\.com\//.test(i.link));
}

/** The stocks CNBC itself tagged on a Mad Money article. */
async function fetchArticleTickers(link) {
  const res = await fetch(link, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`article HTTP ${res.status}`);
  const m = (await res.text()).match(/"tickerSymbols":(\[[^\]]*\])/);
  if (!m) return [];
  try {
    const tags = JSON.parse(m[1]);
    return (Array.isArray(tags) ? tags : [])
      .filter((t) => typeof t?.symbol === "string" && /^[A-Z][A-Z0-9.-]{0,9}$/.test(t.symbol))
      .map((t) => normalizeSymbol(t.symbol));
  } catch {
    return [];
  }
}

/** Mentions in the last MENTION_DAYS days, limited to the curated universe, newest article per stock. */
async function buildMentions(universe, prev, now) {
  const since = new Date(now.getTime() - MENTION_DAYS * 86400000).toISOString();
  const keepPrev = () => ({
    asOf: prev?.asOf ?? null,
    items: (prev?.items ?? []).filter((i) => i.date >= since && universe.has(i.s)),
  });
  let news;
  try {
    news = (await fetchNews()).filter((i) => i.date >= since);
  } catch (e) {
    log("mentions: RSS failed, keeping previous:", e.message);
    return keepPrev();
  }
  const known = new Map((prev?.tagged ?? []).map((x) => [x.link, x.tk]));
  const tagged = [];
  await pool(news, 3, async (item) => {
    let tk = known.get(item.link);
    if (!tk) {
      try {
        tk = await fetchArticleTickers(item.link);
      } catch (e) {
        log("mentions: tags failed:", e.message);
        tk = null;
      }
      await sleep(200);
    }
    if (tk) tagged.push({ ...item, tk });
  });
  const best = new Map();
  for (const item of tagged) {
    for (const s of item.tk) {
      if (!universe.has(s)) continue;
      const cur = best.get(s);
      if (!cur || cur.date < item.date) best.set(s, { s, title: item.title, link: item.link, date: item.date });
    }
  }
  const items = [...best.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.s.localeCompare(b.s)));
  log(`mentions: ${news.length} articles this week, ${items.length} curated stocks mentioned`);
  return { asOf: now.toISOString(), items, tagged: tagged.map(({ link, tk }) => ({ link, tk })) };
}

// ---------- last good dataset ----------

async function lastGood() {
  const cached = await readJson(path.join(CACHE, FILE));
  if (cached?.v === FORMAT) return cached;
  try {
    const get = async (name) => {
      const res = await fetch(`${LIVE_URL}/${name}`, { signal: AbortSignal.timeout(30000) });
      if (!res.ok) throw new Error(`${name} HTTP ${res.status}`);
      return res.json();
    };
    const core = await get(FILE);
    if (core?.v === FORMAT) {
      const more = await get(MORE_FILE);
      log("using the live site's dataset as the last good copy");
      return { ...core, t: [...core.t, ...(more.t ?? [])] };
    }
  } catch (e) {
    log("could not read the live dataset:", e.message);
  }
  return null;
}

/**
 * Two shards, both fetched by the app at startup no matter what Marc picks: the first holds everything
 * needed to draw the popular scenarios quickly, the second holds the rest of the universe.
 */
async function writeShards(ds) {
  const first = (a) => a.pop || a.s === ds.benchmark;
  await writeJson(path.join(OUT, FILE), { ...ds, t: ds.t.filter(first), more: MORE_FILE });
  await writeJson(path.join(OUT, MORE_FILE), { v: ds.v, generatedAt: ds.generatedAt, t: ds.t.filter((a) => !first(a)) });
}

/** The app's dataset from validated daily series. Pure, so the golden-test fixture is built the same way. */
export function assembleDataset({ config, tickers, series, cpi, now, mentions = { asOf: null, items: [] }, quarantined = [] }) {
  const cpiAt = cpiLookup(cpi);
  const moments = config.moments;
  const t = [];
  for (const info of tickers) {
    const snap = series.get(info.s);
    if (!snap) continue;
    const a = buildAsset({ info: { ...info, k: snap.k }, dates: snap.dates, closes: snap.closes, cpiAt, moments });
    if (a) t.push(a);
  }
  const bench = series.get(config.benchmark);
  return {
    v: FORMAT,
    generatedAt: now.toISOString(),
    asOf: ymdInt(bench.dates.at(-1)),
    benchmark: config.benchmark,
    cpi: { b: cpi.b, last: cpi.last, v: cpi.v, filled: cpi.filled ?? [] },
    spx: encodeDaily(bench.dates, bench.closes),
    moments: moments.map(({ id, group, name, date }) => ({ id, group, name, date })),
    t,
    mentions: { asOf: mentions.asOf, items: mentions.items },
    quarantined,
  };
}

// ---------- validation ----------

export function validateDataset(ds, prev, universeSize) {
  const problems = [];
  const spxDays = ds.spx?.c?.length ?? 0;
  if (spxDays < 9000) problems.push(`S&P 500 has only ${spxDays} daily closes`);
  if (!ds.t?.some((a) => a.s === ds.benchmark)) problems.push("benchmark missing");
  if ((ds.t?.length ?? 0) < universeSize * 0.8) problems.push(`only ${ds.t?.length ?? 0}/${universeSize} assets`);
  if ((ds.cpi?.v?.length ?? 0) < 400) problems.push("CPI too short");
  if (prev?.asOf && ds.asOf < prev.asOf) problems.push(`latest close ${ds.asOf} is older than the last good ${prev.asOf}`);
  for (const a of ds.t ?? []) {
    if (!a.c.some((x) => x != null) || !(a.end?.[1] > 0)) problems.push(`${a.s}: empty series`);
  }
  return problems;
}

// ---------- main ----------

async function main() {
  const now = new Date();
  const config = await readJson(path.join(ROOT, "config", "hindsight.json"));
  if (!config) throw new Error("config/hindsight.json missing");
  let tickers = config.tickers;
  if (ONLY) tickers = tickers.filter((t) => t.s === config.benchmark || ONLY.split(",").includes(t.s));
  const universe = new Set(tickers.map((t) => t.s));
  const prev = await lastGood();
  log(`universe: ${tickers.length} assets; last good dataset: ${prev ? prev.asOf : "none"}`);

  // CPI
  let cpi;
  try {
    cpi = await fetchCpi();
    await writeJson(path.join(CACHE, "cpi.json"), cpi);
  } catch (e) {
    cpi = (await readJson(path.join(CACHE, "cpi.json"))) ?? prev?.cpi ?? null;
    if (cpi && cpi.m0 == null) cpi = { ...cpi, m0: monthIndex(cpi.b) };
    log("CPI fetch failed, using last good:", e.message);
  }

  // Daily series: one fresh snapshot per asset, or that asset's last good snapshot.
  const series = new Map();
  let fresh = 0;
  await pool(tickers, 3, async (info) => {
    const cacheFile = path.join(CACHE, "daily", fileFor(info.s));
    try {
      if (OFFLINE) throw new Error("offline");
      const snap = await fetchDaily(info.s, now);
      await writeJson(cacheFile, snap);
      series.set(info.s, snap);
      fresh++;
    } catch (e) {
      const cached = await readJson(cacheFile);
      if (cached) series.set(info.s, cached);
      if (!OFFLINE) log(`  ${info.s}: ${e.message}${cached ? " (using cached snapshot)" : ""}`);
    }
    if (!OFFLINE) await sleep(150);
  });
  log(`daily series: ${fresh} fresh, ${series.size - fresh} cached, ${tickers.length - series.size} missing`);

  const bench = series.get(config.benchmark);
  if (!bench || !cpi) {
    return publishFallback(prev, `no ${bench ? "CPI" : "benchmark"} data`);
  }

  // Quarantine assets with one-day moves nobody has reviewed (usually a broken spinoff adjustment).
  const reviewed = config.reviewedMoves ?? {};
  const quarantined = [];
  for (const info of tickers) {
    let snap = series.get(info.s);
    if (!snap) continue;
    if (info.from) {
      const keep = snap.dates.map((d) => d >= info.from);
      snap = { ...snap, dates: snap.dates.filter((_, i) => keep[i]), closes: snap.closes.filter((_, i) => keep[i]) };
      series.set(info.s, snap);
    }
    const moves = bigMoves(snap.dates, snap.closes).filter((m) => m.date >= "1988-01-01");
    const unreviewed = moves.filter((m) => !reviewed[info.s]?.[m.date]);
    if (unreviewed.length) {
      quarantined.push(info.s);
      series.delete(info.s);
      warn(`quarantined ${info.s}: unreviewed one-day moves ${unreviewed.map((m) => `${m.date} ${(m.move * 100).toFixed(0)}%`).join(", ")}`);
    }
  }

  const mentions = OFFLINE
    ? { asOf: prev?.mentions?.asOf ?? null, items: prev?.mentions?.items ?? [], tagged: prev?.mentions?.tagged ?? [] }
    : await buildMentions(universe, prev?.mentions, now);
  const benchLast = bench.dates.at(-1);
  const dataset = assembleDataset({ config, tickers, series, cpi, now, mentions, quarantined });
  const assets = dataset.t;

  const problems = validateDataset(dataset, prev, tickers.length);
  if (problems.length) return publishFallback(prev, problems.join("; "));

  await writeShards(dataset);
  await writeJson(path.join(CACHE, FILE), { ...dataset, mentions: { ...dataset.mentions, tagged: mentions.tagged } });
  const bytes = JSON.stringify(dataset).length;
  log(`wrote ${OUT}: ${assets.length} assets, prices through ${benchLast}, CPI through ${cpi.last}, ${(bytes / 1024).toFixed(0)} KB`);
}

async function publishFallback(prev, why) {
  warn(`new data rejected (${why})`);
  if (!prev) {
    warn("no last good dataset exists; writing nothing");
    return;
  }
  const mentions = { asOf: prev.mentions?.asOf ?? null, items: prev.mentions?.items ?? [] };
  await writeShards({ ...prev, mentions });
  log(`republished the last good dataset (prices through ${prev.asOf})`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main()
    .catch((e) => warn(`data job failed: ${e?.stack ?? e}`))
    // Exit explicitly so a stalled socket from a timed-out request can never hang the job.
    .finally(() => process.exit(existsSync(path.join(OUT, FILE)) ? 0 : 1));
}
