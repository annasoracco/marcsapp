// Builds the static JSON the site reads: market percent moves, Mad Money segments,
// and per-ticker daily history. Uses only free, keyless public sources.
// Usage: node scripts/build-data.mjs [outDir]
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { FUNDS, MARKET } from './universe.mjs';

const OUT = path.resolve(process.argv[2] || 'site/data');
const LIVE = (process.env.LIVE_BASE_URL || 'https://annasoracco.github.io/marcsapp/').replace(/\/?$/, '/');
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const BOT_UA = 'marcsapp-data/1.0 (+https://github.com/annasoracco/marcsapp)';
const MAD_MONEY_RSS =
  'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15838459';
const MAX_SEGMENTS = 150;
const warnings = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function get(url, { ua = BOT_UA, tries = 3, timeout = 20000, json = false } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': ua, Accept: json ? 'application/json' : '*/*' },
        signal: AbortSignal.timeout(timeout),
      });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return json ? await res.json() : await res.text();
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) await sleep(800 * (i + 1) ** 2);
    }
  }
  throw new Error(`${url.slice(0, 120)}: ${lastErr?.message}`);
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

const decode = (s = '') =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
const stripTags = (s) =>
  decode(s.replace(/<sup[\s\S]*?<\/sup>/g, '').replace(/<[^>]+>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
const toYahoo = (sym) => sym.trim().toUpperCase().replace(/\./g, '-');
const fileFor = (sym) => sym.replace(/[^A-Za-z0-9-]/g, '_');

// ---------- time helpers ----------
const etParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
function etDateTime(date) {
  const p = Object.fromEntries(etParts.formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute };
}
const dayFormatters = new Map();
function dateIn(tz, epochSec) {
  if (!dayFormatters.has(tz)) {
    dayFormatters.set(
      tz,
      new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }),
    );
  }
  return dayFormatters.get(tz).format(new Date(epochSec * 1000));
}
function shiftDate(iso, { days = 0, months = 0, years = 0 }) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years, d.getUTCMonth() + months, d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// Index of the last trading day on or before `iso`, or -1.
function idxOnOrBefore(dates, iso) {
  let lo = 0;
  let hi = dates.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] <= iso) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}
// Mad Money airs after the close, so anything published after 4pm ET is measured from that day's close.
function baselineIndex(dates, when) {
  const { date, minutes } = etDateTime(when);
  const cutoff = minutes >= 16 * 60 ? date : shiftDate(date, { days: -1 });
  return idxOnOrBefore(dates, cutoff);
}
const pct = (a, b) => (a > 0 && b > 0 ? Math.round((a / b - 1) * 10000) / 100 : null);

// ---------- previous published data (merge + fallback) ----------
async function loadPrevious() {
  const prev = {};
  for (const name of ['quotes', 'cramer']) {
    try {
      prev[name] = await get(`${LIVE}data/${name}.json?t=${Date.now()}`, { json: true, tries: 2 });
    } catch (e) {
      log(`no previous ${name}.json (${e.message})`);
    }
  }
  return prev;
}

// ---------- universe: index constituents from Wikipedia ----------
const ICB_TO_GICS = {
  Technology: 'Information Technology',
  Telecommunications: 'Communication Services',
  'Basic Materials': 'Materials',
};
async function wikiTable(page, tag) {
  const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=text&format=json&formatversion=2&redirects=1`;
  const json = await get(url, { json: true });
  const html = json?.parse?.text || '';
  const tables = html.match(/<table class="wikitable[\s\S]*?<\/table>/g) || [];
  for (const table of tables) {
    const rows = table.split(/<tr[\s>]/).slice(1);
    if (!rows.length) continue;
    const header = [...rows[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map((m) => stripTags(m[1]).toLowerCase());
    const symCol = header.findIndex((h) => h === 'symbol' || h === 'ticker');
    const nameCol = header.findIndex((h) => h === 'security' || h === 'company');
    const secCol = header.findIndex((h) => /gics sector|icb industry|^sector$|^industry$/.test(h));
    if (symCol < 0 || nameCol < 0 || secCol < 0) continue;
    const out = [];
    for (const row of rows.slice(1)) {
      const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((m) => stripTags(m[1]));
      if (cells.length <= Math.max(symCol, nameCol, secCol)) continue;
      const sym = toYahoo(cells[symCol]);
      if (!/^[A-Z][A-Z0-9-]{0,9}$/.test(sym)) continue;
      const sector = ICB_TO_GICS[cells[secCol]] || cells[secCol];
      out.push({ sym, name: cells[nameCol], sector, tag });
    }
    if (out.length > 50) return out;
  }
  throw new Error(`no constituent table found on ${page}`);
}

async function buildUniverse(prev) {
  const uni = new Map(); // sym -> {name, sector, kind, tags:Set}
  const add = (sym, info) => {
    const cur = uni.get(sym);
    if (!cur) {
      uni.set(sym, {
        name: info.name || '',
        sector: info.sector || '',
        kind: info.kind || 'stock',
        tags: new Set(info.tag ? [info.tag] : []),
      });
    } else {
      if (info.tag) cur.tags.add(info.tag);
      if (!cur.sector && info.sector) cur.sector = info.sector;
      if (!cur.name && info.name) cur.name = info.name;
    }
  };
  const lists = [
    ['List of S&P 500 companies', 'sp500'],
    ['List of NASDAQ-100 companies', 'ndx'],
    ['List of S&P 400 companies', 'sp400'],
    ['List of S&P 600 companies', 'sp600'],
  ];
  for (const [page, tag] of lists) {
    try {
      const rows = await wikiTable(page, tag);
      log(`${tag}: ${rows.length} constituents`);
      rows.forEach((r) => add(r.sym, r));
    } catch (e) {
      warnings.push(`Could not refresh the ${tag} list, so the last saved list was reused.`);
      log(`${tag} failed: ${e.message}`);
      for (const [sym, q] of Object.entries(prev.quotes?.items || {})) {
        if ((q.x || []).includes(tag)) add(sym, { name: q.n, sector: q.s, tag });
      }
    }
  }
  for (const f of FUNDS) add(f.sym, { name: f.name, sector: f.cat, kind: f.kind });
  for (const group of Object.values(MARKET)) {
    for (const m of group) add(m.sym, { name: m.name, sector: m.cat || '', kind: m.kind });
  }
  return uni;
}

// ---------- Mad Money ----------
function parseRss(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, body]) => {
    const tag = (t) => decode(body.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] || '');
    const link = tag('link');
    const published = new Date(tag('pubDate'));
    return {
      id: tag('guid') || link,
      title: tag('title'),
      link,
      summary: tag('description'),
      published: isNaN(published) ? null : published.toISOString(),
    };
  });
}
async function articleTickers(link) {
  const html = await get(link, { ua: BROWSER_UA, tries: 2 });
  const m = html?.match(/"tickerSymbols":(\[[^\]]*\])/);
  if (!m) return [];
  let arr;
  try {
    arr = JSON.parse(m[1]);
  } catch {
    return [];
  }
  const seen = new Set();
  return arr
    .filter((t) => t && typeof t.symbol === 'string' && /^[A-Z][A-Z0-9.\-]{0,9}$/.test(t.symbol))
    .map((t) => ({ s: toYahoo(t.symbol), n: t.tagName || '', c: t.category === 'Primary' ? 'primary' : 'mentioned' }))
    .filter((t) => !seen.has(t.s) && seen.add(t.s));
}
async function buildCramer(prev) {
  const clean = (s) => ({
    id: s.id,
    title: s.title,
    link: s.link,
    summary: s.summary,
    published: s.published,
    tickersFetched: !!s.tickersFetched,
    tickers: (s.tickers || []).map(({ s: sym, n, c }) => ({ s: sym, n, c })),
  });
  const prevSegs = new Map((prev.cramer?.segments || []).map((s) => [s.id, clean(s)]));
  let items = [];
  try {
    items = parseRss(await get(MAD_MONEY_RSS, { ua: BROWSER_UA })).filter((i) => i.title && i.link && i.published);
    log(`Mad Money feed: ${items.length} items`);
  } catch (e) {
    warnings.push('The Mad Money feed was unavailable this run, so the last saved segments are shown.');
    log(`feed failed: ${e.message}`);
  }
  await pool(items, 3, async (item) => {
    const old = prevSegs.get(item.id);
    if (old?.tickersFetched) {
      item.tickers = old.tickers;
      item.tickersFetched = true;
      return;
    }
    try {
      item.tickers = await articleTickers(item.link);
      item.tickersFetched = true;
    } catch {
      item.tickers = old?.tickers || [];
      item.tickersFetched = false;
    }
    await sleep(300);
  });
  const merged = new Map(prevSegs);
  for (const s of items) merged.set(s.id, clean(s));
  const segments = [...merged.values()].sort((a, b) => b.published.localeCompare(a.published)).slice(0, MAX_SEGMENTS);
  const allTickers = new Map((prev.cramer?.allTickers || []).map((t) => [t.s, t]));
  for (const seg of segments) for (const t of seg.tickers) allTickers.set(t.s, { s: t.s, n: t.n });
  return { segments, allTickers: [...allTickers.values()] };
}

// ---------- prices (Yahoo Finance chart data, no key) ----------
function seriesFrom(resp) {
  const meta = resp?.meta;
  const ts = resp?.timestamp;
  const closes = resp?.indicators?.quote?.[0]?.close;
  if (!meta || !Array.isArray(ts) || !Array.isArray(closes)) return null;
  const tz = meta.exchangeTimezoneName || 'America/New_York';
  const byDate = new Map();
  ts.forEach((t, i) => {
    const c = closes[i];
    if (typeof c === 'number' && isFinite(c) && c > 0) byDate.set(dateIn(tz, t), Math.round(c * 10000) / 10000);
  });
  const dates = [...byDate.keys()].sort();
  if (dates.length < 2) return null;
  return {
    dates,
    closes: dates.map((d) => byDate.get(d)),
    name: meta.longName || meta.shortName || '',
    type: meta.instrumentType || '',
  };
}
async function fetchSpark(symbols, host) {
  const url = `https://${host}/v7/finance/spark?symbols=${symbols.map(encodeURIComponent).join(',')}&range=2y&interval=1d`;
  const json = await get(url, { ua: BROWSER_UA, json: true, tries: 3 });
  const out = new Map();
  for (const r of json?.spark?.result || []) {
    const s = seriesFrom(r?.response?.[0]);
    if (s) out.set(r.symbol, s);
  }
  return out;
}
async function fetchChart(sym, host) {
  const url = `https://${host}/v8/finance/chart/${encodeURIComponent(sym)}?range=2y&interval=1d`;
  const json = await get(url, { ua: BROWSER_UA, json: true, tries: 2 });
  return seriesFrom(json?.chart?.result?.[0]);
}
async function fetchPrices(symbols) {
  const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
  const series = new Map();
  const batches = [];
  for (let i = 0; i < symbols.length; i += 20) batches.push(symbols.slice(i, i + 20));
  await pool(batches, 3, async (batch, i) => {
    try {
      const got = await fetchSpark(batch, hosts[i % 2]);
      got.forEach((v, k) => series.set(k, v));
    } catch (e) {
      log(`spark batch ${i} failed: ${e.message}`);
    }
    await sleep(250);
  });
  const missing = symbols.filter((s) => !series.has(s));
  log(`spark: ${series.size}/${symbols.length}; retrying ${missing.length} individually`);
  if (missing.length && missing.length <= 400) {
    await pool(missing, 3, async (sym, i) => {
      try {
        const s = await fetchChart(sym, hosts[i % 2]);
        if (s) series.set(sym, s);
      } catch {
        /* unknown or delisted symbol */
      }
      await sleep(200);
    });
  }
  return series;
}

// Percent moves: [1 day, 1 week, 1 month, 3 months, year to date, 1 year].
function perf({ dates, closes }) {
  const n = dates.length;
  const last = closes[n - 1];
  const lastDate = dates[n - 1];
  const covered = (iso) => {
    if (dates[0] > iso) return null;
    return closes[idxOnOrBefore(dates, iso)];
  };
  const jan1 = `${lastDate.slice(0, 4)}-01-01`;
  return {
    asOf: lastDate,
    p: [
      pct(last, closes[n - 2]),
      pct(last, covered(shiftDate(lastDate, { days: -7 }))),
      pct(last, covered(shiftDate(lastDate, { months: -1 }))),
      pct(last, covered(shiftDate(lastDate, { months: -3 }))),
      pct(last, dates[0] < jan1 ? covered(shiftDate(jan1, { days: -1 })) : null),
      pct(last, covered(shiftDate(lastDate, { years: -1 }))),
    ],
  };
}

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(data));
}

async function main() {
  const startedAt = new Date();
  const prev = await loadPrevious();
  const universe = await buildUniverse(prev);
  const cramer = await buildCramer(prev);
  for (const t of cramer.allTickers) {
    if (!universe.has(t.s)) universe.set(t.s, { name: t.n, sector: '', kind: 'stock', tags: new Set() });
    universe.get(t.s).tags.add('cramer');
  }

  const symbols = [...universe.keys()];
  log(`universe: ${symbols.length} symbols`);
  const series = await fetchPrices(symbols);
  log(`prices: ${series.size}/${symbols.length}`);

  // CNBC tags can use symbols that mean something else on the price source; drop clear mismatches.
  const firstWord = (n) => (n || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim().split(/\s+/)[0] || '';
  for (const [sym, info] of universe) {
    const s = series.get(sym);
    const cramerOnly = info.tags.size === 1 && info.tags.has('cramer') && info.kind === 'stock';
    if (cramerOnly && s?.name && info.name && firstWord(s.name) !== firstWord(info.name)) {
      log(`dropping ${sym}: CNBC "${info.name}" vs price source "${s.name}"`);
      series.delete(sym);
    }
  }

  // If the price source mostly failed, reuse the last published history instead of publishing gaps.
  const stale = new Set();
  if (series.size < symbols.length * 0.9 && prev.quotes) {
    const missing = symbols.filter((s) => !series.has(s) && prev.quotes.items?.[s]);
    log(`reusing last published history for ${missing.length} symbols`);
    await pool(missing, 8, async (sym) => {
      try {
        const h = await get(`${LIVE}data/h/${fileFor(sym)}.json`, { json: true, tries: 2 });
        if (h?.d?.length > 1) {
          series.set(sym, { dates: h.d, closes: h.c, name: prev.quotes.items[sym].n, type: '' });
          stale.add(sym);
        }
      } catch {
        /* skip */
      }
    });
    if (stale.size) warnings.push(`The price source was partly unavailable; ${stale.size} tickers show their last saved data.`);
  }
  if (series.size < symbols.length * 0.3) {
    throw new Error(`Only ${series.size} of ${symbols.length} tickers have data; not publishing.`);
  }

  await rm(OUT, { recursive: true, force: true });
  const items = {};
  let asOf = '';
  await pool([...series.entries()], 16, async ([sym, s]) => {
    const info = universe.get(sym);
    const { asOf: a, p } = perf(s);
    if (sym === '^GSPC') asOf = a;
    const kind =
      info.kind !== 'stock' ? info.kind : s.type === 'ETF' ? 'etf' : s.type === 'MUTUALFUND' ? 'fund' : 'stock';
    items[sym] = {
      n: info.name || s.name || sym,
      s: info.sector || (kind === 'stock' ? '' : 'Other funds'),
      k: kind,
      x: [...info.tags],
      a,
      p,
      ...(stale.has(sym) ? { st: 1 } : {}),
    };
    await writeJson(path.join(OUT, 'h', `${fileFor(sym)}.json`), { s: sym, d: s.dates, c: s.closes });
  });

  // Moves since each segment was published, using CNBC's own ticker tags for the article.
  for (const seg of cramer.segments) {
    const when = new Date(seg.published);
    for (const t of seg.tickers) {
      const s = series.get(t.s);
      t.since = null;
      t.fresh = false;
      if (!s) continue;
      const i = baselineIndex(s.dates, when);
      if (i < 0) continue;
      if (i === s.dates.length - 1) t.fresh = true;
      else t.since = pct(s.closes[s.closes.length - 1], s.closes[i]);
    }
  }

  const sp = Object.entries(items).filter(([, v]) => v.x.includes('sp500'));
  const movers = [0, 1, 2, 3, 4, 5].map((k) => {
    const ranked = sp.filter(([, v]) => v.p[k] != null).sort((a, b) => b[1].p[k] - a[1].p[k]);
    const pick = (list) => list.slice(0, 5).map(([sym, v]) => ({ s: sym, n: v.n, v: v.p[k] }));
    return {
      up: ranked.filter(([, v]) => v.p[k] > 0).length,
      total: ranked.length,
      gainers: pick(ranked),
      losers: pick([...ranked].reverse()),
    };
  });
  const group = (list) =>
    list.filter((m) => items[m.sym]).map((m) => ({ s: m.sym, n: m.label || m.name, p: items[m.sym].p, a: items[m.sym].a }));
  const updated = startedAt.toISOString();

  await writeJson(path.join(OUT, 'quotes.json'), { updated, asOf, items });
  await writeJson(path.join(OUT, 'market.json'), {
    updated,
    asOf,
    indexes: group(MARKET.indexes),
    sectors: group(MARKET.sectors),
    themes: group(MARKET.themes),
    other: group(MARKET.other),
    movers,
  });
  await writeJson(path.join(OUT, 'cramer.json'), { updated, segments: cramer.segments, allTickers: cramer.allTickers });
  await writeJson(path.join(OUT, 'meta.json'), {
    updated,
    asOf,
    tickers: Object.keys(items).length,
    segments: cramer.segments.length,
    warnings,
  });
  log(`wrote ${Object.keys(items).length} tickers, ${cramer.segments.length} segments to ${OUT}`);
  if (warnings.length) log('warnings:\n  ' + warnings.join('\n  '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
