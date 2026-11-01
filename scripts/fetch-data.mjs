#!/usr/bin/env node
// Market data job. Writes static JSON for the app into --out (default public/data).
//
//   node scripts/fetch-data.mjs [--out public/data] [--cache .data-cache] [--sample] [--force-heavy]
//
// Every run refreshes quotes (prices, daily % change, earnings dates) and the Mad Money RSS
// headlines. Heavy data (2+ years of daily closes, fund look-through, sectors) is refreshed at
// most once per trading-day close and kept in --cache between runs.
//
// Resilience: this script never exits non-zero. If Yahoo is unreachable it falls back to the
// cache, then to the currently deployed site's data, and only as a last resort generates
// clearly-labelled sample data (meta.source = "sample", which the app shows as a banner).
import { appendFile, copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = path.resolve(opt("out", path.join(ROOT, "public", "data")));
const CACHE = path.resolve(opt("cache", path.join(ROOT, ".data-cache")));
const LIVE_URL = opt("live-url", "https://annasoracco.github.io/marcsapp/data");
const SAMPLE_ONLY = flag("sample");
const FORCE_HEAVY = flag("force-heavy");
const HISTORY_DAYS = 800; // a bit over 2 years so 2-year back-dated calls always resolve
const FUNDS_MAX_AGE_DAYS = 6;
const MAD_MONEY_RSS = "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15838459";
const UA = "marcsapp-data-job/1.0 (+https://github.com/annasoracco/marcsapp)";

const log = (...a) => console.log(`[data ${new Date().toISOString().slice(11, 19)}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round = (x, d = 4) => (Number.isFinite(x) ? Number(x.toFixed(d)) : undefined);
const sig = (x) => (Number.isFinite(x) ? Number(x.toPrecision(6)) : undefined);

export const fileFor = (symbol) => `${symbol.replace(/\^/g, "_")}.json`;

export function normalizeSymbol(raw) {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/^\$/, "")
    .replace(/\./g, "-");
}

const YAHOO_SECTOR = {
  Technology: "Information Technology",
  "Financial Services": "Financials",
  Healthcare: "Health Care",
  "Consumer Cyclical": "Consumer Discretionary",
  "Consumer Defensive": "Consumer Staples",
  "Basic Materials": "Materials",
  "Communication Services": "Communication Services",
  Industrials: "Industrials",
  Energy: "Energy",
  Utilities: "Utilities",
  "Real Estate": "Real Estate",
};
const FUND_SECTOR = {
  technology: "Information Technology",
  financial_services: "Financials",
  healthcare: "Health Care",
  consumer_cyclical: "Consumer Discretionary",
  consumer_defensive: "Consumer Staples",
  basic_materials: "Materials",
  communication_services: "Communication Services",
  industrials: "Industrials",
  energy: "Energy",
  utilities: "Utilities",
  realestate: "Real Estate",
};
const KIND = { EQUITY: "s", ETF: "e", MUTUALFUND: "f", MONEYMARKET: "m", INDEX: "i" };

// ---------- small utilities ----------

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
      return await withTimeout(fn(), 30000, label);
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message ?? e);
      if (/Not Found|No data found|delisted|Quote not found|404/i.test(msg)) break;
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

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

const etFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});
function etParts(d) {
  const p = Object.fromEntries(etFmt.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute), weekday: p.weekday };
}
const etDate = (d) => etParts(d).date;

function toDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v < 1e11 ? v * 1000 : v);
  if (typeof v === "string") return new Date(v);
  return null;
}
const epoch = (v) => {
  const d = toDate(v);
  return d && !Number.isNaN(d.getTime()) ? Math.round(d.getTime() / 1000) : undefined;
};

/** True if the last heavy refresh happened before the most recent weekday 4:15pm ET close. */
function heavyIsStale(lastIso, now = new Date()) {
  if (!lastIso) return true;
  const last = new Date(lastIso);
  if (Number.isNaN(last.getTime())) return true;
  const CLOSE = 16 * 60 + 15;
  // Walk back from now to find the latest weekday close moment.
  for (let back = 0; back < 7; back++) {
    const probe = new Date(now.getTime() - back * 86400000);
    const p = etParts(probe);
    if (p.weekday === "Sat" || p.weekday === "Sun") continue;
    if (back === 0 && p.minutes < CLOSE) continue;
    const lp = etParts(last);
    return lp.date < p.date || (lp.date === p.date && lp.minutes < CLOSE);
  }
  return false;
}

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

const cleanName = (s) => (s ? decodeEntities(String(s)).replace(/\s+/g, " ").trim() : undefined);

// ---------- universe ----------

async function loadUniverse() {
  const u = await readJson(path.join(ROOT, "config", "universe.json"));
  const extra = await readJson(path.join(ROOT, "config", "extra-tickers.json"), { tickers: [] });
  if (!u) throw new Error("config/universe.json missing");
  const map = new Map();
  const add = (s, info) => {
    const sym = normalizeSymbol(s);
    if (!sym) return;
    map.set(sym, { ...(map.get(sym) ?? {}), ...info, s: sym });
  };
  for (const s of extra.tickers ?? []) add(s, {});
  for (const s of u.mutualFunds) add(s, { k: "f" });
  for (const s of u.etfs) add(s, { k: "e" });
  for (const s of u.stocks) add(s.s, { k: "s", n: s.n, sector: s.sector });
  for (const s of u.indices) add(s.s, { k: "i", n: s.n });
  return { map, sectorEtfs: u.sectorEtfs, indices: u.indices.map((i) => i.s) };
}

// ---------- Yahoo fetchers ----------

let yfPromise;
async function yahoo() {
  yfPromise ??= import("yahoo-finance2").then(
    ({ default: YahooFinance }) => new YahooFinance({ suppressNotices: ["yahooSurvey"] }),
  );
  return yfPromise;
}

async function fetchQuotes(symbols) {
  const yf = await yahoo();
  const out = {};
  await pool(chunk(symbols, 50), 2, async (batch) => {
    try {
      const res = await retry(() => yf.quote(batch, {}, { validateResult: false }), `quote ${batch[0]}..`);
      for (const q of Array.isArray(res) ? res : Object.values(res ?? {})) if (q?.symbol) out[normalizeSymbol(q.symbol)] = q;
    } catch (e) {
      log("quote batch failed:", e.message);
    }
    await sleep(250);
  });
  return out;
}

async function fetchHistory(symbol) {
  const yf = await yahoo();
  const period1 = new Date(Date.now() - HISTORY_DAYS * 86400000);
  const call = (validate) =>
    yf.chart(symbol, { period1, interval: "1d" }, validate ? undefined : { validateResult: false });
  let res;
  try {
    res = await retry(() => call(true), `chart ${symbol}`, 2);
  } catch {
    res = await retry(() => call(false), `chart ${symbol}`, 2);
  }
  const byDate = new Map();
  for (const q of res?.quotes ?? []) {
    const close = q?.adjclose ?? q?.close;
    const d = toDate(q?.date);
    if (!Number.isFinite(close) || close <= 0 || !d) continue;
    byDate.set(etDate(d), sig(close));
  }
  const dates = [...byDate.keys()].sort();
  if (dates.length < 2) throw new Error(`chart ${symbol}: no rows`);
  return encodeHistory(symbol, dates, dates.map((d) => byDate.get(d)));
}

export function encodeHistory(symbol, dates, closes) {
  const deltas = dates.map((d, i) => (i === 0 ? 0 : Math.round((Date.parse(d) - Date.parse(dates[i - 1])) / 86400000)));
  return { s: symbol, b: dates[0], d: deltas, c: closes };
}

async function fetchFund(symbol) {
  const yf = await yahoo();
  const r = await retry(
    () => yf.quoteSummary(symbol, { modules: ["topHoldings"] }, { validateResult: false }),
    `holdings ${symbol}`,
    2,
  );
  const t = r?.topHoldings;
  if (!t) return null;
  const sec = {};
  for (const o of t.sectorWeightings ?? []) {
    for (const [k, v] of Object.entries(o ?? {})) {
      if (FUND_SECTOR[k] && v > 0) sec[FUND_SECTOR[k]] = round(v, 4);
    }
  }
  const pos = (v) => (Number.isFinite(v) ? Math.max(0, round(v, 4)) : 0);
  return {
    st: pos(t.stockPosition) + pos(t.preferredPosition),
    bd: pos(t.bondPosition) + pos(t.convertiblePosition),
    ca: pos(t.cashPosition),
    ot: pos(t.otherPosition),
    h: (t.holdings ?? [])
      .filter((h) => h && h.holdingPercent > 0)
      .map((h) => [normalizeSymbol(h.symbol), round(h.holdingPercent, 5), cleanName(h.holdingName) ?? ""]),
    sec,
  };
}

async function fetchSector(symbol) {
  const yf = await yahoo();
  const r = await retry(
    () => yf.quoteSummary(symbol, { modules: ["assetProfile"] }, { validateResult: false }),
    `profile ${symbol}`,
    2,
  );
  const s = r?.assetProfile?.sector;
  return s ? (YAHOO_SECTOR[s] ?? s) : null;
}

async function fetchNews() {
  const res = await fetch(MAD_MONEY_RSS, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`RSS HTTP ${res.status}`);
  const xml = await res.text();
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
    .map((m) => {
      const get = (tag) => decodeEntities(m[1].match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`))?.[1] ?? "");
      const date = new Date(get("pubDate"));
      return { title: get("title"), link: get("link"), date: Number.isNaN(date.getTime()) ? null : date.toISOString() };
    })
    .filter((i) => i.title && i.date && /^https:\/\/www\.cnbc\.com\//.test(i.link))
    .slice(0, 30);
  if (!items.length) throw new Error("RSS had no items");
  return items;
}

/** The stocks CNBC itself tagged on a Mad Money article ("Primary" or "Mentioned"). */
async function fetchArticleTickers(link) {
  const res = await fetch(link, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`article HTTP ${res.status}`);
  const m = (await res.text()).match(/"tickerSymbols":(\[[^\]]*\])/);
  if (!m) return [];
  let tags;
  try {
    tags = JSON.parse(m[1]);
  } catch {
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const t of Array.isArray(tags) ? tags : []) {
    // Skips CNBC-only codes such as ".SPX" index symbols.
    if (typeof t?.symbol !== "string" || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(t.symbol)) continue;
    const s = normalizeSymbol(t.symbol);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push({ s, n: cleanName(t.tagName) ?? "", ...(t.category === "Primary" ? { p: 1 } : {}) });
  }
  return out;
}

/** Trading day whose close a segment is measured from: the show airs after the 4pm ET bell. */
export function airDate(iso) {
  const { date, minutes } = etParts(new Date(iso));
  return minutes >= 16 * 60 ? date : addDaysIso(date, -1);
}

function addDaysIso(iso, days) {
  return new Date(Date.parse(iso) + days * 86400000).toISOString().slice(0, 10);
}

function decodeHistoryFile(h) {
  const dates = [];
  let cur = h.b;
  for (let i = 0; i < h.d.length; i++) {
    if (i > 0) cur = addDaysIso(cur, h.d[i]);
    dates.push(cur);
  }
  return { dates, closes: h.c.slice(0, dates.length) };
}

/** Return since the close on/before `from`, using history plus the latest quote (same as the app). */
export function moveSince(series, quote, from) {
  if (!series?.dates.length) return null;
  let { dates, closes } = series;
  if (quote && Number.isFinite(quote.p) && quote.t) {
    const qDate = etDate(new Date(quote.t * 1000));
    const last = dates[dates.length - 1];
    if (qDate === last) closes = [...closes.slice(0, -1), quote.p];
    else if (qDate > last) {
      dates = [...dates, qDate];
      closes = [...closes, quote.p];
    }
  }
  let i = -1;
  for (let j = dates.length - 1; j >= 0; j--) {
    if (dates[j] <= from) {
      i = j;
      break;
    }
  }
  if (i < 0) return null;
  if (i === dates.length - 1) return { fresh: true };
  return { move: closes[closes.length - 1] / closes[i] - 1 };
}

const firstWord = (name) =>
  String(name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)[0] ?? "";

// ---------- fallback: bootstrap cache from the deployed site ----------

async function bootstrapFromLive() {
  const get = async (rel) => {
    const res = await fetch(`${LIVE_URL}/${rel}`, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`${rel} HTTP ${res.status}`);
    return res.json();
  };
  const meta = await get("meta.json");
  if (meta.source === "sample") throw new Error("deployed data is sample data; not reusing it");
  const market = await get("market.json");
  await writeJson(path.join(CACHE, "market.json"), market);
  await writeJson(path.join(CACHE, "funds.json"), await get("funds.json").catch(() => ({ f: {} })));
  await writeJson(path.join(CACHE, "news.json"), await get("news.json").catch(() => ({ items: [] })));
  const profiles = {};
  for (const [s, t] of Object.entries(market.t ?? {})) if (t.k === "s" && t.sec) profiles[s] = t.sec;
  await writeJson(path.join(CACHE, "profiles.json"), profiles);
  let ok = 0;
  await pool(Object.keys(market.t ?? {}), 8, async (s) => {
    try {
      await writeJson(path.join(CACHE, "history", fileFor(s)), await get(`history/${encodeURIComponent(fileFor(s))}`));
      ok++;
    } catch {
      /* missing history files are refetched later */
    }
  });
  await writeJson(path.join(CACHE, "heavy.json"), {
    historyAt: meta.historyAsOf ?? null,
    fundsAt: meta.fundsAsOf ?? null,
  });
  log(`bootstrapped cache from live site: ${Object.keys(market.t ?? {}).length} tickers, ${ok} history files`);
}

// ---------- sample data (last resort, clearly labelled) ----------

function prng(seedStr) {
  let h = 2166136261;
  for (const ch of seedStr) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLE_BOND_FUNDS = new Set(["BND", "AGG", "BNDX", "TLT", "IEF", "SHY", "LQD", "HYG", "JNK", "TIP", "VTIP", "MUB", "VGIT", "VGSH", "VCIT", "SCHZ", "VBTLX", "FXNAX", "VTABX", "PTTRX", "PIMIX", "MWTRX", "DODIX", "SWAGX", "FIPDX"]);
const SAMPLE_CASH = new Set(["SGOV", "BIL", "JPST", "USFR", "SPAXX", "FDRXX", "VMFXX", "SWVXX"]);

async function writeSample(universe) {
  const now = new Date();
  const today = etDate(now);
  const days = [];
  for (let t = Date.parse(today) - HISTORY_DAYS * 86400000; t <= Date.parse(today); t += 86400000) {
    const wd = new Date(t).getUTCDay();
    if (wd !== 0 && wd !== 6) days.push(new Date(t).toISOString().slice(0, 10));
  }
  const t = {};
  const history = {};
  const sectors = Object.values(YAHOO_SECTOR);
  for (const [sym, info] of universe.map) {
    const rnd = prng(sym);
    const k = info.k ?? "s";
    const vol = k === "s" ? 0.018 : k === "i" ? 0.01 : 0.009;
    let price = SAMPLE_CASH.has(sym) ? 1 : 20 + rnd() * 400;
    const closes = [];
    for (let i = 0; i < days.length; i++) {
      if (!SAMPLE_CASH.has(sym)) price *= 1 + 0.0004 + vol * (rnd() + rnd() + rnd() - 1.5) * 1.4;
      closes.push(sig(price));
    }
    history[sym] = encodeHistory(sym, days, closes);
    const last = closes.at(-1);
    const prev = closes.at(-2);
    const entry = {
      n: info.n ?? `${sym} (sample)`,
      k: SAMPLE_CASH.has(sym) && k === "f" ? "m" : k,
      p: last,
      c: round(last / prev - 1, 6),
      t: Math.round(now.getTime() / 1000),
    };
    if (entry.k === "s") {
      entry.sec = info.sector ?? sectors[Math.floor(rnd() * sectors.length)];
      entry.e = Math.round(now.getTime() / 1000) + Math.floor(rnd() * 60) * 86400;
      entry.est = 1;
    }
    t[sym] = entry;
  }
  const top = ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "BRK-B", "AVGO", "TSLA", "JPM"];
  const f = {};
  for (const [sym, e] of Object.entries(t)) {
    if (e.k !== "e" && e.k !== "f") continue;
    if (SAMPLE_BOND_FUNDS.has(sym)) f[sym] = { st: 0, bd: 0.98, ca: 0.02, ot: 0, h: [], sec: {} };
    else if (SAMPLE_CASH.has(sym)) f[sym] = { st: 0, bd: 0, ca: 1, ot: 0, h: [], sec: {} };
    else {
      const sec = {};
      sectors.forEach((s) => (sec[s] = round(1 / sectors.length, 4)));
      f[sym] = {
        st: 0.99,
        bd: 0,
        ca: 0.01,
        ot: 0,
        h: top.map((s, i) => [s, round(0.07 - i * 0.005, 5), t[s]?.n ?? s]),
        sec,
      };
    }
  }
  const iso = now.toISOString();
  await rm(OUT, { recursive: true, force: true });
  await writeJson(path.join(OUT, "market.json"), { asOf: iso, t });
  await writeJson(path.join(OUT, "funds.json"), { asOf: iso, f });
  await writeJson(path.join(OUT, "news.json"), { asOf: iso, items: [] });
  for (const [sym, h] of Object.entries(history)) await writeJson(path.join(OUT, "history", fileFor(sym)), h);
  await writeJson(path.join(OUT, "meta.json"), {
    v: 1,
    source: "sample",
    generatedAt: iso,
    quotesAsOf: iso,
    historyAsOf: iso,
    fundsAsOf: iso,
    newsAsOf: null,
    sectorEtfs: universe.sectorEtfs,
    indices: universe.indices,
    counts: { tickers: Object.keys(t).length, history: Object.keys(history).length, funds: Object.keys(f).length, news: 0 },
  });
  log(`wrote SAMPLE data for ${Object.keys(t).length} tickers to ${OUT}`);
}

// ---------- main live run ----------

async function runLive(universe) {
  await mkdir(path.join(CACHE, "history"), { recursive: true });
  if (!existsSync(path.join(CACHE, "market.json"))) {
    try {
      await bootstrapFromLive();
    } catch (e) {
      log("no cache and could not bootstrap from live site:", e.message);
    }
  }
  const prevMarket = await readJson(path.join(CACHE, "market.json"), { t: {} });
  const prevFunds = await readJson(path.join(CACHE, "funds.json"), { f: {} });
  const prevNews = await readJson(path.join(CACHE, "news.json"), { items: [] });
  const profiles = await readJson(path.join(CACHE, "profiles.json"), {});
  const heavy = await readJson(path.join(CACHE, "heavy.json"), {});
  const now = new Date();

  // 0) Mad Money headlines (official CNBC RSS) plus the stocks CNBC tagged in each article.
  //    Runs first so newly tagged stocks get quotes and history in this same run.
  let news = prevNews;
  try {
    const items = await fetchNews();
    const prevByLink = new Map((prevNews.items ?? []).map((i) => [i.link, i]));
    await pool(items, 3, async (item) => {
      const old = prevByLink.get(item.link);
      if (Array.isArray(old?.tk)) {
        item.tk = old.tk.map(({ s, n, p }) => ({ s, n, ...(p ? { p } : {}) }));
        return;
      }
      try {
        item.tk = await fetchArticleTickers(item.link);
      } catch (e) {
        log("  tags failed:", e.message);
      }
      await sleep(200);
    });
    news = { asOf: now.toISOString(), items };
    log(`news: ${items.length} headlines, ${items.filter((i) => i.tk?.length).length} with tagged stocks`);
  } catch (e) {
    log("news failed, keeping previous:", e.message);
  }
  for (const item of news.items ?? []) item.air = airDate(item.date);

  // Tagged stocks stay covered for a year after CNBC last tagged them, so tracked calls keep scoring.
  const tagged = { ...(prevNews.tagged ?? {}) };
  for (const item of news.items ?? []) {
    for (const tag of item.tk ?? []) {
      const seen = item.date.slice(0, 10);
      if (!tagged[tag.s] || tagged[tag.s].seen < seen) tagged[tag.s] = { n: tag.n || tagged[tag.s]?.n || "", seen };
    }
  }
  const keepAfter = addDaysIso(etDate(now), -365);
  for (const [s, v] of Object.entries(tagged)) if (v.seen < keepAfter) delete tagged[s];
  for (const [s, v] of Object.entries(tagged)) if (!universe.map.has(s)) universe.map.set(s, { s, k: "s", tagged: v.n });
  const symbols = [...universe.map.keys()];

  // 1) Quotes, every run.
  const quotes = await fetchQuotes(symbols);
  // A CNBC symbol can mean a different security on Yahoo; skip clear name mismatches.
  const mismatched = new Set();
  for (const [s, info] of universe.map) {
    const yName = quotes[s]?.longName ?? quotes[s]?.shortName;
    if (info.tagged && yName && firstWord(info.tagged) !== firstWord(cleanName(yName))) {
      log(`skipping ${s}: CNBC calls it "${info.tagged}", Yahoo "${yName}"`);
      delete quotes[s];
      mismatched.add(s);
    }
  }
  const liveCount = Object.keys(quotes).length;
  log(`quotes: ${liveCount}/${symbols.length}`);
  const quotesOk = liveCount >= symbols.length * 0.5;

  // 2) Heavy data, once per close (or when new tickers appear).
  const historyFiles = new Set((await readdir(path.join(CACHE, "history")).catch(() => [])).map((f) => f));
  const knownSymbols = symbols.filter((s) => !mismatched.has(s) && (quotes[s] || prevMarket.t[s]));
  // Money market funds sit at $1 and have no chart history.
  const historySymbols = knownSymbols.filter((s) => (KIND[quotes[s]?.quoteType] ?? prevMarket.t[s]?.k) !== "m");
  const missingHistory = historySymbols.filter((s) => !historyFiles.has(fileFor(s)));
  const historyStale = FORCE_HEAVY || heavyIsStale(heavy.historyAt, now);
  let heavyRefreshed = false;

  if (quotesOk && (historyStale || missingHistory.length)) {
    const targets = historyStale ? historySymbols : missingHistory;
    log(`history: fetching ${targets.length} tickers (${historyStale ? "daily refresh" : "new tickers"})`);
    let ok = 0;
    let fail = 0;
    await pool(targets, 3, async (s) => {
      try {
        await writeJson(path.join(CACHE, "history", fileFor(s)), await fetchHistory(s));
        ok++;
      } catch (e) {
        fail++;
        if (fail <= 15) log("  history failed:", e.message);
      }
      await sleep(120);
    });
    log(`history: ${ok} ok, ${fail} failed`);
    if (ok > 0) heavyRefreshed = true;
    if (historyStale && ok >= targets.length * 0.5) heavy.historyAt = now.toISOString();
  }

  // Sectors for stocks not covered by the GICS list in config/universe.json.
  if (quotesOk) {
    const needSector = knownSymbols.filter((s) => {
      const k = KIND[quotes[s]?.quoteType] ?? universe.map.get(s)?.k;
      return k === "s" && !universe.map.get(s)?.sector && !profiles[s];
    });
    if (needSector.length) {
      log(`sectors: looking up ${needSector.length}`);
      await pool(needSector, 3, async (s) => {
        try {
          const sec = await fetchSector(s);
          if (sec) profiles[s] = sec;
        } catch {
          /* leave unknown */
        }
        await sleep(120);
      });
      heavyRefreshed = true;
    }
  }

  // Fund look-through (top holdings, sector weights), weekly.
  const funds = { ...(prevFunds.f ?? {}) };
  const fundSymbols = knownSymbols.filter((s) => {
    const k = KIND[quotes[s]?.quoteType] ?? prevMarket.t[s]?.k ?? universe.map.get(s)?.k;
    return k === "e" || k === "f";
  });
  const fundsStale =
    FORCE_HEAVY || !heavy.fundsAt || now.getTime() - Date.parse(heavy.fundsAt) > FUNDS_MAX_AGE_DAYS * 86400000;
  const missingFunds = fundSymbols.filter((s) => !funds[s]);
  if (quotesOk && (fundsStale || missingFunds.length)) {
    const targets = fundsStale ? fundSymbols : missingFunds;
    log(`funds: fetching look-through for ${targets.length}`);
    let ok = 0;
    const fetchSet = async (list) =>
      pool(list, 3, async (s) => {
        try {
          const f = await fetchFund(s);
          if (f) {
            funds[s] = f;
            ok++;
          }
        } catch {
          /* keep previous */
        }
        await sleep(150);
      });
    await fetchSet(targets);
    // Second level: target-date and fund-of-funds often hold other mutual funds.
    const nested = new Set();
    for (const s of targets) for (const [h] of funds[s]?.h ?? []) if (/^[A-Z]{4}X$/.test(h) && !funds[h]) nested.add(h);
    if (nested.size) {
      log(`funds: fetching ${nested.size} underlying funds`);
      await fetchSet([...nested].slice(0, 120));
    }
    log(`funds: ${ok} ok`);
    if (ok > 0) heavyRefreshed = true;
    if (fundsStale && ok >= targets.length * 0.5) heavy.fundsAt = now.toISOString();
  }

  // 3) Assemble market.json.
  const t = {};
  let maxQuoteTime = 0;
  for (const s of symbols) {
    if (mismatched.has(s)) continue;
    const q = quotes[s];
    const prev = prevMarket.t[s];
    const info = universe.map.get(s);
    if (!q && !prev) continue;
    if (!q) {
      t[s] = prev;
      continue;
    }
    const k = KIND[q.quoteType] ?? info.k ?? prev?.k ?? "s";
    const entry = {
      n: cleanName(q.longName ?? q.shortName) ?? info.n ?? prev?.n ?? s,
      k,
      p: sig(q.regularMarketPrice),
      c: round((q.regularMarketChangePercent ?? 0) / 100, 6),
      t: epoch(q.regularMarketTime),
    };
    if (q.marketState) entry.ms = q.marketState;
    if (k === "s") {
      const sec = info.sector ?? profiles[s] ?? prev?.sec;
      if (sec) entry.sec = sec;
      const e = epoch(q.earningsTimestamp ?? q.earningsTimestampStart);
      if (e) {
        entry.e = e;
        if (q.isEarningsDateEstimate) entry.est = 1;
        const ec = epoch(q.earningsCallTimestampStart);
        if (ec) entry.ec = ec;
      }
    }
    if (!Number.isFinite(entry.p)) continue;
    if (k !== "f" && k !== "m" && entry.t) maxQuoteTime = Math.max(maxQuoteTime, entry.t);
    t[s] = entry;
  }
  if (!Object.keys(t).length) throw new Error("no quotes and no cached quotes");
  // "Prices as of" follows the S&P 500 ETF's regular-session quote time.
  if (t.SPY?.t) maxQuoteTime = t.SPY.t;

  // 4) How each tagged stock has moved since its segment aired.
  const seriesCache = new Map();
  for (const item of news.items ?? []) {
    for (const tag of item.tk ?? []) {
      delete tag.m;
      delete tag.f;
      if (!t[tag.s]) continue;
      if (!seriesCache.has(tag.s)) {
        const h = await readJson(path.join(CACHE, "history", fileFor(tag.s)));
        seriesCache.set(tag.s, h ? decodeHistoryFile(h) : null);
      }
      const r = moveSince(seriesCache.get(tag.s), t[tag.s], item.air);
      if (r?.fresh) tag.f = 1;
      else if (Number.isFinite(r?.move)) tag.m = round(r.move, 6);
    }
  }
  news.tagged = tagged;

  // 5) Persist cache, then write the output folder.
  const market = { asOf: now.toISOString(), t };
  const fundsOut = { asOf: heavy.fundsAt ?? now.toISOString(), f: funds };
  await writeJson(path.join(CACHE, "market.json"), market);
  await writeJson(path.join(CACHE, "funds.json"), fundsOut);
  await writeJson(path.join(CACHE, "news.json"), news);
  await writeJson(path.join(CACHE, "profiles.json"), profiles);
  await writeJson(path.join(CACHE, "heavy.json"), heavy);

  await rm(OUT, { recursive: true, force: true });
  await mkdir(path.join(OUT, "history"), { recursive: true });
  let historyCount = 0;
  for (const s of Object.keys(t)) {
    const src = path.join(CACHE, "history", fileFor(s));
    if (existsSync(src)) {
      await copyFile(src, path.join(OUT, "history", fileFor(s)));
      historyCount++;
    }
  }
  const usedFunds = {};
  const want = new Set(Object.keys(t));
  for (const [s, f] of Object.entries(funds)) if (want.has(s) || /^[A-Z]{4}X$/.test(s)) usedFunds[s] = f;
  await writeJson(path.join(OUT, "market.json"), market);
  await writeJson(path.join(OUT, "funds.json"), { ...fundsOut, f: usedFunds });
  await writeJson(path.join(OUT, "news.json"), news);
  const meta = {
    v: 1,
    source: quotesOk ? "live" : "cached",
    generatedAt: now.toISOString(),
    quotesAsOf: maxQuoteTime ? new Date(maxQuoteTime * 1000).toISOString() : (prevMarket.asOf ?? now.toISOString()),
    historyAsOf: heavy.historyAt ?? null,
    fundsAsOf: heavy.fundsAt ?? null,
    newsAsOf: news.asOf ?? null,
    sectorEtfs: universe.sectorEtfs,
    indices: universe.indices,
    counts: {
      tickers: Object.keys(t).length,
      history: historyCount,
      funds: Object.keys(usedFunds).length,
      news: news.items?.length ?? 0,
    },
  };
  await writeJson(path.join(OUT, "meta.json"), meta);
  log(`wrote ${OUT}: source=${meta.source}, tickers=${meta.counts.tickers}, history=${historyCount}, funds=${meta.counts.funds}`);
  return heavyRefreshed;
}

async function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function main() {
  const universe = await loadUniverse();
  log(`universe: ${universe.map.size} tickers`);
  if (SAMPLE_ONLY) {
    await writeSample(universe);
    return;
  }
  let heavyRefreshed = false;
  try {
    heavyRefreshed = await runLive(universe);
  } catch (e) {
    log("live run failed:", e?.stack ?? e);
    if (!existsSync(path.join(OUT, "meta.json"))) {
      log("falling back to sample data");
      await writeSample(universe);
    }
  }
  await setOutput("heavy_refreshed", heavyRefreshed ? "true" : "false");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main()
    .catch((e) => log("fatal:", e?.stack ?? e))
    // Exit explicitly so a stalled socket from a timed-out request can never hang the job.
    .finally(() => process.exit(0));
}

export { heavyIsStale, decodeEntities };
