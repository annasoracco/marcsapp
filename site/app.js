// Bird's Eye: Cramer desk, account X-ray and market pulse. Percentages only, never dollars.
// Everything Marc types (accounts, tracked calls) lives in this browser's localStorage only.

const PERIODS = [
  { label: 'Today', long: 'today' },
  { label: '1W', long: 'over the past week' },
  { label: '1M', long: 'over the past month' },
  { label: '3M', long: 'over the past 3 months' },
  { label: 'YTD', long: 'so far this year' },
  { label: '1Y', long: 'over the past year' },
];
const SPX = '^GSPC';
const KEYS = { accounts: 'birdseye.accounts.v1', calls: 'birdseye.calls.v1', prefs: 'birdseye.prefs.v1' };
const TABS = ['cramer', 'accounts', 'market'];

// ---------- storage (device only) ----------
const store = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      toast('Could not save on this device. Is private browsing on?');
    }
  },
};
let accounts = store.get(KEYS.accounts, []);
let calls = store.get(KEYS.calls, []);
const prefs = { period: 0, sub: 'segments', filter: 'all', ...store.get(KEYS.prefs, {}) };
const saveAccounts = () => store.set(KEYS.accounts, accounts);
const saveCalls = () => store.set(KEYS.calls, calls);
const savePrefs = () => store.set(KEYS.prefs, prefs);

// ---------- helpers ----------
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeLink = (u) => (/^https:\/\/(www\.)?cnbc\.com\//.test(u || '') ? u : null);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const fileFor = (sym) => sym.replace(/[^A-Za-z0-9-]/g, '_');
const normSym = (s) => String(s || '').trim().toUpperCase().replace(/^\$/, '').replace(/\./g, '-');
const validSym = (s) => /^[A-Z0-9][A-Z0-9^=-]{0,11}$/.test(s);

function fmtPct(v, digits = 1) {
  if (v == null || !isFinite(v)) return '—';
  const r = +v.toFixed(digits);
  const sign = r > 0 ? '+' : r < 0 ? '−' : '';
  return `${sign}${Math.abs(r).toFixed(digits)}%`;
}
const tone = (v) => (v == null ? 'flat' : +v.toFixed(1) > 0 ? 'up' : +v.toFixed(1) < 0 ? 'down' : 'flat');
const pct = (a, b) => (a > 0 && b > 0 ? Math.round((a / b - 1) * 10000) / 100 : null);

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtDay = (iso) => (iso ? dayFmt.format(new Date(`${iso}T12:00:00Z`)) : '');
const etFmt = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/New_York',
});
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
function shiftDay(iso, days) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// Mad Money airs after the 4pm ET close, so calls are measured from that day's close.
function baseDateFor(when) {
  const { date, minutes } = etDateTime(when);
  return minutes >= 16 * 60 ? date : shiftDay(date, -1);
}
function ago(iso) {
  const s = (Date.now() - new Date(iso)) / 1000;
  if (!isFinite(s)) return '';
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
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

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// ---------- data ----------
const D = { quotes: null, market: null, cramer: null, meta: null, loaded: false, loadedAt: 0 };
let symbolIndex = [];
const histCache = new Map();

async function loadData() {
  const names = ['quotes', 'market', 'cramer', 'meta'];
  const results = await Promise.allSettled(
    names.map((n) => fetch(`data/${n}.json`, { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : Promise.reject(r.status)))),
  );
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') D[names[i]] = r.value;
  });
  D.loaded = true;
  D.loadedAt = Date.now();
  symbolIndex = D.quotes
    ? Object.entries(D.quotes.items)
        .filter(([, v]) => v.k !== 'index' && v.k !== 'commodity')
        .map(([s, v]) => [s, v.n.toLowerCase(), v.n])
        .sort((a, b) => a[0].localeCompare(b[0]))
    : [];
  histCache.clear();
  render();
}
const quote = (sym) => D.quotes?.items?.[sym] || null;
const nameOf = (sym) => quote(sym)?.n || '';

function getHist(sym) {
  if (!histCache.has(sym)) {
    histCache.set(
      sym,
      fetch(`data/h/${fileFor(sym)}.json`, { cache: 'no-cache' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    );
  }
  return histCache.get(sym);
}

// ---------- shared UI ----------
function periodPicker() {
  return `<div class="seg-ctl" role="group" aria-label="Time period">${PERIODS.map(
    (p, k) => `<button type="button" data-action="period" data-k="${k}" aria-pressed="${prefs.period === k}">${p.label}</button>`,
  ).join('')}</div>`;
}
function bars(rows, { sort = true } = {}) {
  const list = sort ? [...rows].sort((a, b) => (b.v ?? -1e9) - (a.v ?? -1e9)) : rows;
  const max = Math.max(0.01, ...list.map((r) => Math.abs(r.v ?? 0)));
  return `<ul class="bars">${list
    .map((r) => {
      const w = r.v == null ? 0 : (Math.abs(r.v) / max) * 50;
      const side = (r.v ?? 0) >= 0 ? 'left:50%' : 'right:50%';
      return `<li>
        <span class="bl">${esc(r.label)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span>
        <span class="bt" aria-hidden="true"><span class="bf ${tone(r.v)}" style="${side};width:${w.toFixed(1)}%"></span></span>
        <span class="bv ${tone(r.v)}">${fmtPct(r.v)}</span>
      </li>`;
    })
    .join('')}</ul>`;
}
function asOfLine(src) {
  if (!src) return '';
  return `Through ${esc(fmtDay(src.asOf))} · updated ${esc(ago(src.updated))}`;
}
function noData(what = 'Market data') {
  if (!D.loaded) return `<div class="card skeleton" aria-busy="true"><p class="muted">Loading…</p></div>`;
  return `<div class="card empty"><h3>${esc(what)} isn't available yet</h3>
    <p class="muted">The data refreshes several times a day. Check back in a little while.</p></div>`;
}

// ---------- Cramer desk ----------
let segLimit = 20;
const isLightning = (s) => /lightning round/i.test(s.title);
function heldSet() {
  return new Set(accounts.flatMap((a) => a.tickers));
}

function renderCramer() {
  const el = $('#view-cramer');
  const sub = prefs.sub === 'calls' ? 'calls' : 'segments';
  el.innerHTML = `
    <div class="view-head">
      <h2>Cramer desk</h2>
      <p class="muted">Latest Mad Money segments, and how his calls are playing out.</p>
    </div>
    <div class="seg-ctl wide" role="group" aria-label="Cramer desk section">
      <button type="button" data-action="sub" data-sub="segments" aria-pressed="${sub === 'segments'}">Latest segments</button>
      <button type="button" data-action="sub" data-sub="calls" aria-pressed="${sub === 'calls'}">My call tracker${calls.length ? ` (${calls.length})` : ''}</button>
    </div>
    <div id="cramer-body">${sub === 'calls' ? '' : segmentsHtml()}</div>`;
  if (sub === 'calls') renderCalls();
}

function tickerChip(t, held) {
  const has = !!quote(t.s);
  let move = '<span class="nd">no data</span>';
  if (has && t.fresh) move = '<span class="nd">new</span>';
  else if (has && t.since != null) move = `<span class="${tone(t.since)}">${fmtPct(t.since)}</span>`;
  const title = `${t.n || t.s}${t.c === 'primary' ? ' (main stock in this segment)' : ''}`;
  return `<span class="tk${t.c === 'primary' ? ' primary' : ''}${held.has(t.s) ? ' held' : ''}" title="${esc(title)}">
    <b>${esc(t.s)}</b>${move}${held.has(t.s) ? '<i class="dot" aria-label="you own this"></i>' : ''}</span>`;
}

function segmentsHtml() {
  const c = D.cramer;
  if (!c?.segments?.length) return noData('The Mad Money feed');
  const held = heldSet();
  let segs = c.segments;
  if (prefs.filter === 'lightning') segs = segs.filter(isLightning);
  if (prefs.filter === 'mine') segs = segs.filter((s) => s.tickers.some((t) => held.has(t.s)));
  const filters = [
    ['all', 'All'],
    ['lightning', 'Lightning round'],
    ...(held.size ? [['mine', 'Your stocks']] : []),
  ];
  const shown = segs.slice(0, segLimit);
  return `
    <div class="chips-row" role="group" aria-label="Filter segments">${filters
      .map(([k, l]) => `<button type="button" class="chip" data-action="filter" data-f="${k}" aria-pressed="${prefs.filter === k}">${l}</button>`)
      .join('')}</div>
    <p class="note">Percent moves are since each segment was published, for the stocks CNBC tagged in it. A tag isn't a buy or sell call. <b>new</b> means it aired after the last close.${held.size ? ' <i class="dot"></i> marks stocks you own.' : ''}</p>
    ${shown.length ? '' : `<div class="card empty"><p class="muted">No segments match this filter yet.</p></div>`}
    ${shown.map((s) => segmentCard(s, held)).join('')}
    ${segs.length > segLimit ? `<button type="button" class="btn ghost block" data-action="more-segs">Show more segments</button>` : ''}
    <p class="foot">Segments from CNBC's public Mad Money feed · updated ${esc(ago(c.updated))}. Not affiliated with CNBC or Jim Cramer.</p>`;
}

function segmentCard(s, held) {
  const link = safeLink(s.link);
  const tickers = [...s.tickers].sort((a, b) => (a.c === 'primary' ? -1 : 0) - (b.c === 'primary' ? -1 : 0));
  return `<article class="card seg">
    <div class="seg-meta">
      <span class="badge${isLightning(s) ? ' bolt' : ''}">${isLightning(s) ? 'Lightning round' : 'Mad Money'}</span>
      <time datetime="${esc(s.published)}">${esc(etFmt.format(new Date(s.published)))} ET</time>
    </div>
    <h3>${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)}</h3>
    ${tickers.length ? `<div class="tks">${tickers.map((t) => tickerChip(t, held)).join('')}</div>` : ''}
    <div class="seg-actions">
      ${link ? `<a class="btn ghost" href="${esc(link)}" target="_blank" rel="noopener">Read on CNBC</a>` : ''}
      <button type="button" class="btn" data-action="track" data-seg="${esc(s.id)}">Track a call</button>
    </div>
  </article>`;
}

async function evalCall(c) {
  const [h, spx] = await Promise.all([getHist(c.sym), getHist(SPX)]);
  if (!h?.d?.length) return { status: 'nodata' };
  const i = idxOnOrBefore(h.d, c.base);
  if (i < 0) return { status: 'nodata' };
  const last = h.d.length - 1;
  if (i === last) return { status: 'early', baseDate: h.d[i] };
  const move = pct(h.c[last], h.c[i]);
  let spxMove = null;
  if (spx?.d?.length) {
    const j = idxOnOrBefore(spx.d, c.base);
    if (j >= 0 && j < spx.d.length - 1) spxMove = pct(spx.c[spx.c.length - 1], spx.c[j]);
  }
  const withCall = c.dir === 'bull' ? move : -move;
  const vsMarket = spxMove == null ? null : c.dir === 'bull' ? move - spxMove : spxMove - move;
  return {
    status: withCall > 0 ? 'working' : withCall < 0 ? 'not' : 'flat',
    move,
    spxMove,
    withCall,
    vsMarket,
    baseDate: h.d[i],
    asOf: h.d[last],
  };
}

let callsRenderId = 0;
async function renderCalls() {
  const body = $('#cramer-body');
  if (!body) return;
  const intro = `<div class="card empty">
      <h3>Keep score on Cramer</h3>
      <p class="muted">Heard a call you want to follow? Tap <b>Track a call</b> on any segment, pick the stock, and say whether he was bullish or bearish. You'll see how it has moved since, and how that compares with the S&amp;P 500.</p>
      <button type="button" class="btn" data-action="add-call">Add a call by hand</button>
    </div>`;
  if (!calls.length) {
    body.innerHTML = intro;
    return;
  }
  const myId = ++callsRenderId;
  body.innerHTML = `<div class="card skeleton" aria-busy="true"><p class="muted">Scoring your calls…</p></div>`;
  const results = await Promise.all(calls.map(evalCall));
  if (myId !== callsRenderId || prefs.sub !== 'calls' || currentTab() !== 'cramer') return;
  const scored = results.filter((r) => r.status === 'working' || r.status === 'not' || r.status === 'flat');
  const wins = scored.filter((r) => r.status === 'working').length;
  const avg = scored.length ? scored.reduce((a, r) => a + r.withCall, 0) / scored.length : null;
  const vs = scored.filter((r) => r.vsMarket != null);
  const beat = vs.filter((r) => r.vsMarket > 0).length;
  const order = calls.map((c, i) => [c, results[i]]).sort((a, b) => (b[0].base || '').localeCompare(a[0].base || ''));
  body.innerHTML = `
    <section class="card score">
      <div class="score-big"><b>${scored.length ? `${wins} of ${scored.length}` : '—'}</b><span>calls working</span></div>
      <dl class="score-stats">
        <div><dt>Average move in his direction</dt><dd class="${tone(avg)}">${fmtPct(avg)}</dd></div>
        <div><dt>Beat the S&amp;P 500</dt><dd>${vs.length ? `${beat} of ${vs.length}` : '—'}</dd></div>
      </dl>
      ${results.length > scored.length ? `<p class="muted small">${results.length - scored.length} call${results.length - scored.length === 1 ? ' is' : 's are'} too new or ha${results.length - scored.length === 1 ? 's' : 've'} no price data yet.</p>` : ''}
    </section>
    <ul class="calls">${order.map(([c, r]) => callRow(c, r)).join('')}</ul>
    <button type="button" class="btn ghost block" data-action="add-call">Add a call by hand</button>
    <p class="foot">"Working" means the stock moved the way he called it: up for bullish, down for bearish. Measured from the close on the call date, price change only. Your calls are saved only on this phone.</p>`;
}

function callRow(c, r) {
  const status = {
    working: ['Working', 'up'],
    not: ['Not working', 'down'],
    flat: ['Flat', 'flat'],
    early: ['Too early', 'flat'],
    nodata: ['No price data', 'flat'],
  }[r.status];
  const link = safeLink(c.link);
  return `<li class="card call">
    <div class="call-top">
      <div>
        <b class="sym">${esc(c.sym)}</b> <span class="dir ${c.dir}">${c.dir === 'bull' ? 'Bullish' : 'Bearish'}</span>
        <div class="muted small">${esc(nameOf(c.sym) || c.name || '')}</div>
      </div>
      <span class="pill ${status[1]}">${status[0]}</span>
    </div>
    <div class="call-nums">
      <div><span class="muted small">Since call</span><b class="${tone(r.move)}">${fmtPct(r.move)}</b></div>
      <div><span class="muted small">S&amp;P 500, same stretch</span><b class="${tone(r.spxMove)}">${fmtPct(r.spxMove)}</b></div>
    </div>
    <div class="muted small">From the close on ${esc(fmtDay(r.baseDate || c.base))}${c.note ? ` · ${esc(c.note)}` : ''}</div>
    ${c.title ? `<div class="small call-src">${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(c.title)}</a>` : esc(c.title)}</div>` : ''}
    <div class="call-actions"><button type="button" class="link-btn" data-action="del-call" data-id="${esc(c.id)}">Remove</button></div>
  </li>`;
}

// ---------- Account X-ray ----------
let showAllHoldings = false;
function renderAccounts() {
  const el = $('#view-accounts');
  const k = prefs.period;
  const head = `<div class="view-head">
      <h2>Account X-ray</h2>
      <p class="muted">Just tickers, never balances. Saved only on this phone.</p>
    </div>`;
  if (!accounts.length) {
    el.innerHTML = `${head}
      <div class="card empty">
        <h3>See all your accounts at once</h3>
        <p class="muted">Add each account with a nickname and the tickers in it. Bird's Eye shows which stocks repeat across accounts, your sector mix, and how everything is moving, all in percentages.</p>
        <p class="muted small">No balances, share counts, or account numbers. Nothing you enter leaves this phone.</p>
        <button type="button" class="btn" data-action="edit-account">Add your first account</button>
      </div>`;
    return;
  }
  const holdings = new Map();
  for (const a of accounts) for (const s of a.tickers) holdings.set(s, [...(holdings.get(s) || []), a]);
  const uniq = [...holdings.keys()];
  const overlaps = uniq
    .filter((s) => holdings.get(s).length > 1)
    .sort((a, b) => holdings.get(b).length - holdings.get(a).length || a.localeCompare(b));

  const sectors = new Map();
  for (const s of uniq) {
    const q = quote(s);
    const sec = q ? q.s || (q.k === 'stock' ? 'Other stocks' : 'Other funds') : 'No data yet';
    sectors.set(sec, (sectors.get(sec) || 0) + 1);
  }
  const secRows = [...sectors.entries()].sort((a, b) => b[1] - a[1]);
  const top = secRows[0];

  const perfRows = uniq.map((s) => ({ s, v: quote(s)?.p?.[k] ?? null, n: holdings.get(s).length }));
  const withData = perfRows.filter((r) => r.v != null).sort((a, b) => b.v - a.v);
  const without = perfRows.filter((r) => r.v == null);
  const spx = quote(SPX)?.p?.[k] ?? null;
  const avgOf = (list) => {
    const vals = list.map((s) => quote(s)?.p?.[k]).filter((v) => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const allAvg = avgOf(uniq);
  const held = new Set(uniq);
  const cramerHits = (D.cramer?.segments || []).filter((s) => s.tickers.some((t) => held.has(t.s))).slice(0, 6);
  const holdingsList = showAllHoldings ? withData : withData.slice(0, 12);

  el.innerHTML = `${head}
    ${periodPicker()}
    <section class="card accts">
      <div class="card-head"><h3>Your accounts</h3><button type="button" class="btn small" data-action="edit-account">Add account</button></div>
      <ul class="acct-list">${accounts
        .map(
          (a) => `<li><button type="button" class="acct" data-action="edit-account" data-id="${esc(a.id)}">
            <span><b>${esc(a.name)}</b><small>${a.tickers.length} holding${a.tickers.length === 1 ? '' : 's'}</small></span>
            <span class="${tone(avgOf(a.tickers))}">${fmtPct(avgOf(a.tickers))}</span></button></li>`,
        )
        .join('')}</ul>
      <p class="muted small">Account moves are equal-weighted (every holding counts the same), since the app never knows amounts.</p>
    </section>

    <section class="card summary">
      <div><b>${uniq.length}</b><span>different holdings</span></div>
      <div><b>${overlaps.length}</b><span>in 2+ accounts</span></div>
      <div><b class="${tone(allAvg)}">${fmtPct(allAvg)}</b><span>average, ${esc(PERIODS[k].label)}</span></div>
      <div><b class="${tone(spx)}">${fmtPct(spx)}</b><span>S&amp;P 500, ${esc(PERIODS[k].label)}</span></div>
    </section>

    <section class="card">
      <h3>Overlap across accounts</h3>
      ${
        accounts.length < 2
          ? `<p class="muted">Add a second account to see which holdings repeat.</p>`
          : overlaps.length
            ? `<ul class="overlap">${overlaps
                .map((s) => {
                  const inAccts = holdings.get(s);
                  return `<li>
                    <div class="ov-top"><b class="sym">${esc(s)}</b><span class="muted small">${esc(nameOf(s))}</span>
                      <span class="ov-count">in ${inAccts.length} of ${accounts.length}</span></div>
                    <div class="ov-dots" aria-hidden="true">${accounts.map((a) => `<i class="${inAccts.includes(a) ? 'on' : ''}"></i>`).join('')}</div>
                    <div class="muted small">${inAccts.map((a) => esc(a.name)).join(' · ')}</div>
                  </li>`;
                })
                .join('')}</ul>`
            : `<p class="muted">No overlap. Every holding lives in just one account.</p>`
      }
    </section>

    <section class="card">
      <h3>Sector mix</h3>
      ${top ? `<p class="lede">Biggest bucket: <b>${esc(top[0])}</b>, ${top[1]} of ${uniq.length} holdings (${Math.round((top[1] / uniq.length) * 100)}%).</p>` : ''}
      <ul class="mix">${secRows
        .map(
          ([sec, n]) => `<li><span class="bl">${esc(sec)}</span>
            <span class="mt" aria-hidden="true"><span style="width:${((n / uniq.length) * 100).toFixed(1)}%"></span></span>
            <span class="bv">${Math.round((n / uniq.length) * 100)}%</span></li>`,
        )
        .join('')}</ul>
      <p class="muted small">Counts each holding once, not by size. Sector funds count toward their sector.</p>
    </section>

    <section class="card">
      <h3>How your holdings are moving</h3>
      <p class="muted small">${esc(PERIODS[k].long.replace(/^./, (c) => c.toUpperCase()))}, best to worst.</p>
      ${bars(holdingsList.map((r) => ({ label: r.s, sub: nameOf(r.s), v: r.v })), { sort: false })}
      ${withData.length > 12 ? `<button type="button" class="btn ghost block" data-action="all-holdings">${showAllHoldings ? 'Show fewer' : `Show all ${withData.length}`}</button>` : ''}
      ${without.length ? `<p class="muted small">No price data for ${without.map((r) => esc(r.s)).join(', ')}. The app covers S&amp;P 500, 400 and 600 stocks, the Nasdaq-100, popular ETFs and funds, and stocks Cramer discusses.</p>` : ''}
    </section>

    <section class="card">
      <h3>Cramer on your stocks</h3>
      ${
        cramerHits.length
          ? `<ul class="hits">${cramerHits
              .map((s) => {
                const mine = s.tickers.filter((t) => held.has(t.s));
                const link = safeLink(s.link);
                return `<li><div class="muted small">${esc(etFmt.format(new Date(s.published)))} ET</div>
                  ${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">${esc(s.title)}</a>` : esc(s.title)}
                  <div class="tks">${mine.map((t) => tickerChip(t, new Set())).join('')}</div></li>`;
              })
              .join('')}</ul>`
          : `<p class="muted">None of your holdings have come up in recent Mad Money segments.</p>`
      }
    </section>
    <p class="foot">Price change only, dividends not included. ${esc(asOfLine(D.quotes))}.</p>`;
}

// ---------- Market pulse ----------
function renderMarket() {
  const el = $('#view-market');
  const m = D.market;
  const k = prefs.period;
  if (!m) {
    el.innerHTML = `<div class="view-head"><h2>Market pulse</h2></div>${noData()}`;
    return;
  }
  const mv = m.movers?.[k];
  const breadth = mv?.total ? Math.round((mv.up / mv.total) * 100) : null;
  const moverList = (list) =>
    `<ol class="movers">${(list || [])
      .map((x) => `<li><b class="sym">${esc(x.s)}</b><span class="muted small">${esc(x.n)}</span><span class="${tone(x.v)}">${fmtPct(x.v)}</span></li>`)
      .join('')}</ol>`;
  el.innerHTML = `
    <div class="view-head">
      <h2>Market pulse</h2>
      <p class="muted">${asOfLine(m)}</p>
    </div>
    ${periodPicker()}
    <div class="tiles">${m.indexes
      .map((x) => `<div class="tile"><span>${esc(x.n)}</span><b class="${tone(x.p[k])}">${fmtPct(x.p[k], 2)}</b></div>`)
      .join('')}</div>
    ${
      mv
        ? `<section class="card">
      <h3>Breadth</h3>
      <p class="lede"><b>${mv.up}</b> of ${mv.total} S&amp;P 500 stocks are up ${esc(PERIODS[k].long)}.</p>
      <div class="meter" role="img" aria-label="${breadth}% of S&P 500 stocks up"><span style="width:${breadth}%"></span></div>
    </section>`
        : ''
    }
    <section class="card"><h3>Sectors</h3>${bars(m.sectors.map((x) => ({ label: x.n, sub: x.s, v: x.p[k] })))}</section>
    <section class="card"><h3>Industries to watch</h3>${bars(m.themes.map((x) => ({ label: x.n, sub: x.s, v: x.p[k] })))}</section>
    ${
      mv
        ? `<section class="card">
      <h3>Biggest S&amp;P 500 movers</h3>
      <div class="two">
        <div><h4 class="up">Up the most</h4>${moverList(mv.gainers)}</div>
        <div><h4 class="down">Down the most</h4>${moverList(mv.losers)}</div>
      </div>
    </section>`
        : ''
    }
    <section class="card"><h3>Beyond stocks</h3>${bars(m.other.map((x) => ({ label: x.n, sub: x.s, v: x.p[k] })), { sort: false })}</section>
    <p class="foot">Sectors and industries are tracked with their ETFs (ticker shown). Price change only. Data from Yahoo Finance, refreshed several times each weekday.</p>`;
}

// ---------- sheets ----------
const sheet = () => $('#sheet');
function openSheet(html, onMount) {
  const dlg = sheet();
  dlg.innerHTML = `<div class="sheet-body" tabindex="-1">${html}</div>`;
  if (!dlg.open) dlg.showModal();
  onMount?.(dlg);
  (dlg.querySelector('[autofocus]') || dlg.querySelector('.sheet-body')).focus({ preventScroll: true });
  dlg.scrollTop = 0;
}
function closeSheet() {
  if (sheet().open) sheet().close();
}

function suggestions(q, exclude = new Set()) {
  const s = normSym(q);
  if (!s) return [];
  const ql = String(q).trim().toLowerCase();
  const starts = symbolIndex.filter(([sym]) => sym.startsWith(s) && !exclude.has(sym));
  const exact = starts.filter(([sym]) => sym === s);
  const named = ql.length >= 3 ? symbolIndex.filter(([sym, n]) => n.includes(ql) && !sym.startsWith(s) && !exclude.has(sym)) : [];
  return [...exact, ...starts.filter(([sym]) => sym !== s), ...named].slice(0, 6);
}
function wireTickerInput(dlg, { onPick, exclude }) {
  const input = dlg.querySelector('[data-ticker-input]');
  const box = dlg.querySelector('[data-suggest]');
  const draw = () => {
    const list = suggestions(input.value, exclude());
    box.innerHTML = list
      .map(([sym, , n]) => `<button type="button" class="sugg" data-sym="${esc(sym)}"><b>${esc(sym)}</b><span>${esc(n)}</span></button>`)
      .join('');
  };
  input.addEventListener('input', draw);
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-sym]');
    if (!b) return;
    onPick(b.dataset.sym);
    input.value = '';
    box.innerHTML = '';
    input.focus();
  });
  return { input, box, draw };
}

function openAccountSheet(id) {
  const existing = accounts.find((a) => a.id === id);
  let tickers = existing ? [...existing.tickers] : [];
  openSheet(
    `<form class="form" novalidate>
      <h2 id="sheet-title">${existing ? 'Edit account' : 'Add an account'}</h2>
      <label class="field">Nickname
        <input name="name" maxlength="40" required autocomplete="off" placeholder="e.g. Fidelity Roth IRA" value="${esc(existing?.name || '')}" ${existing ? '' : 'autofocus'} />
        <small class="muted">A label only. Never enter account numbers or balances.</small>
      </label>
      <div class="field">
        <span>Tickers in this account</span>
        <div class="add-row">
          <input data-ticker-input aria-label="Add a ticker" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Ticker or company, e.g. AAPL" />
          <button type="button" class="btn small" data-add>Add</button>
        </div>
        <div class="suggest" data-suggest></div>
        <small class="muted">Tip: paste a list like "AAPL, MSFT, VOO" and tap Add.</small>
        <div class="tks editable" data-chips></div>
      </div>
      <p class="form-error" role="alert" data-err></p>
      <div class="sheet-actions">
        ${existing ? `<button type="button" class="btn danger ghost" data-del>Delete</button>` : ''}
        <span class="spacer"></span>
        <button type="button" class="btn ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn">Save</button>
      </div>
    </form>`,
    (dlg) => {
      const chips = dlg.querySelector('[data-chips]');
      const err = dlg.querySelector('[data-err]');
      const drawChips = () => {
        chips.innerHTML = tickers.length
          ? tickers
              .map(
                (s) => `<span class="tk${quote(s) ? '' : ' missing'}"><b>${esc(s)}</b>${quote(s) ? '' : '<span class="nd">no data</span>'}
                  <button type="button" class="x" data-rm="${esc(s)}" aria-label="Remove ${esc(s)}">×</button></span>`,
              )
              .join('')
          : '<span class="muted small">No tickers yet.</span>';
      };
      const addMany = (raw) => {
        const parts = String(raw).split(/[\s,;]+/).map(normSym).filter(Boolean);
        const bad = parts.filter((p) => !validSym(p));
        for (const p of parts) if (validSym(p) && !tickers.includes(p)) tickers.push(p);
        err.textContent = bad.length ? `Skipped ${bad.join(', ')}: that doesn't look like a ticker.` : '';
        drawChips();
      };
      const { input, box } = wireTickerInput(dlg, { onPick: (s) => addMany(s), exclude: () => new Set(tickers) });
      dlg.querySelector('[data-add]').addEventListener('click', () => {
        const typed = input.value.trim();
        if (!typed) return;
        const exactName = !/[\s,;]/.test(typed) && !validSym(normSym(typed)) ? suggestions(typed)[0]?.[0] : null;
        addMany(exactName || typed);
        input.value = '';
        box.innerHTML = '';
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          dlg.querySelector('[data-add]').click();
        }
      });
      chips.addEventListener('click', (e) => {
        const b = e.target.closest('[data-rm]');
        if (!b) return;
        tickers = tickers.filter((t) => t !== b.dataset.rm);
        drawChips();
      });
      dlg.querySelector('[data-cancel]').addEventListener('click', closeSheet);
      dlg.querySelector('[data-del]')?.addEventListener('click', () => {
        if (!confirm(`Delete "${existing.name}" from this phone?`)) return;
        accounts = accounts.filter((a) => a.id !== existing.id);
        saveAccounts();
        closeSheet();
        render();
        toast('Account deleted');
      });
      dlg.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        if (input.value.trim()) addMany(input.value);
        const name = dlg.querySelector('[name=name]').value.trim();
        if (!name) {
          err.textContent = 'Give the account a nickname.';
          return;
        }
        if (!tickers.length) {
          err.textContent = 'Add at least one ticker.';
          return;
        }
        if (existing) Object.assign(existing, { name, tickers });
        else accounts.push({ id: uid(), name, tickers });
        saveAccounts();
        closeSheet();
        render();
        toast('Saved on this phone');
      });
      drawChips();
    },
  );
}

function openTrackSheet(segId) {
  const seg = D.cramer?.segments?.find((s) => s.id === segId) || null;
  const tags = seg ? [...seg.tickers].sort((a, b) => (a.c === 'primary' ? -1 : 0) - (b.c === 'primary' ? -1 : 0)) : [];
  let chosen = tags.length === 1 ? tags[0].s : '';
  const base = seg ? baseDateFor(new Date(seg.published)) : etDateTime(new Date()).date;
  const today = etDateTime(new Date()).date;
  openSheet(
    `<form class="form" novalidate>
      <h2 id="sheet-title">Track a Cramer call</h2>
      ${seg ? `<p class="muted small">From: ${esc(seg.title)}</p>` : ''}
      <fieldset class="field">
        <legend>Which stock?</legend>
        ${
          tags.length
            ? `<div class="tks pick" data-picks>${tags
                .map(
                  (t) => `<button type="button" class="tk pickable" data-pick="${esc(t.s)}" aria-pressed="${chosen === t.s}">
                    <b>${esc(t.s)}</b><span class="nd">${esc((t.n || '').slice(0, 22))}</span></button>`,
                )
                .join('')}</div>
              <small class="muted">Tagged by CNBC in this segment. Or type another:</small>`
            : ''
        }
        <input data-ticker-input aria-label="Ticker" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Ticker or company" ${tags.length ? '' : 'autofocus'} />
        <div class="suggest" data-suggest></div>
        <p class="chosen" data-chosen></p>
      </fieldset>
      <fieldset class="field">
        <legend>Was Cramer bullish or bearish?</legend>
        <div class="dir-pick">
          <label class="dir-opt bull"><input type="radio" name="dir" value="bull" /><span><b>Bullish</b><small>Buy, own it, likes it</small></span></label>
          <label class="dir-opt bear"><input type="radio" name="dir" value="bear" /><span><b>Bearish</b><small>Sell, avoid, doesn't like it</small></span></label>
        </div>
      </fieldset>
      <label class="field">Measure from the close on
        <input type="date" name="base" value="${esc(base)}" max="${esc(today)}" required />
        <small class="muted">${seg ? 'Set from when the segment was published.' : 'The day he made the call. Mad Money airs after the close.'}</small>
      </label>
      <label class="field">Note (optional)
        <input name="note" maxlength="80" autocomplete="off" placeholder="e.g. said buy on any pullback" />
      </label>
      <p class="form-error" role="alert" data-err></p>
      <div class="sheet-actions">
        <span class="spacer"></span>
        <button type="button" class="btn ghost" data-cancel>Cancel</button>
        <button type="submit" class="btn">Track it</button>
      </div>
    </form>`,
    (dlg) => {
      const err = dlg.querySelector('[data-err]');
      const chosenEl = dlg.querySelector('[data-chosen]');
      const drawChosen = () => {
        dlg.querySelectorAll('[data-pick]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pick === chosen)));
        chosenEl.innerHTML = chosen
          ? `Tracking <b>${esc(chosen)}</b>${nameOf(chosen) ? ` · ${esc(nameOf(chosen))}` : ''}${quote(chosen) ? '' : ' <span class="nd">(no price data yet)</span>'}`
          : '';
      };
      const { input } = wireTickerInput(dlg, {
        onPick: (s) => {
          chosen = s;
          drawChosen();
        },
        exclude: () => new Set(),
      });
      input.addEventListener('change', () => {
        const s = normSym(input.value);
        if (validSym(s)) {
          chosen = s;
          drawChosen();
        }
      });
      dlg.querySelector('[data-picks]')?.addEventListener('click', (e) => {
        const b = e.target.closest('[data-pick]');
        if (!b) return;
        chosen = b.dataset.pick;
        input.value = '';
        drawChosen();
      });
      dlg.querySelector('[data-cancel]').addEventListener('click', closeSheet);
      dlg.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const typed = normSym(input.value);
        if (typed && validSym(typed)) chosen = typed;
        const dir = dlg.querySelector('[name=dir]:checked')?.value;
        const baseVal = dlg.querySelector('[name=base]').value;
        if (!chosen) return void (err.textContent = 'Pick the stock he made the call on.');
        if (!dir) return void (err.textContent = 'Choose bullish or bearish.');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(baseVal)) return void (err.textContent = 'Pick the date of the call.');
        calls.push({
          id: uid(),
          sym: chosen,
          name: nameOf(chosen) || tags.find((t) => t.s === chosen)?.n || '',
          dir,
          base: baseVal,
          note: dlg.querySelector('[name=note]').value.trim(),
          segId: seg?.id || null,
          title: seg?.title || '',
          link: safeLink(seg?.link) || '',
          created: new Date().toISOString(),
        });
        saveCalls();
        closeSheet();
        prefs.sub = 'calls';
        savePrefs();
        location.hash = '#cramer';
        render();
        toast(`Tracking ${chosen}`);
      });
      drawChosen();
    },
  );
}

function openInfoSheet() {
  const meta = D.meta;
  openSheet(
    `<div class="form info">
      <h2 id="sheet-title">About Bird's Eye</h2>
      <p>A market desk for Marc. It shows how things are moving in <b>percentages only</b>. It never asks for or shows balances, share counts, or dollar amounts.</p>
      <h3>Your privacy</h3>
      <p>Your accounts and tracked calls are saved only in this browser on this phone. They are never uploaded. To score a call, the app downloads that stock's public price file from this site.</p>
      <p class="muted small">Clearing Safari or Chrome website data erases them, so keep a backup.</p>
      <div class="btn-row">
        <button type="button" class="btn small" data-copy>Copy backup</button>
        <button type="button" class="btn small ghost" data-restore>Restore a backup</button>
      </div>
      <div data-restore-box hidden>
        <label class="field">Paste your backup text
          <textarea rows="4" data-restore-text spellcheck="false"></textarea>
        </label>
        <button type="button" class="btn small" data-restore-go>Restore</button>
      </div>
      <h3>Put it on your home screen</h3>
      <p><b>iPhone:</b> in Safari, tap Share, then <i>Add to Home Screen</i>.<br /><b>Android:</b> in Chrome, tap ⋮, then <i>Add to Home screen</i>.</p>
      <h3>Where the data comes from</h3>
      <p>Mad Money segments: CNBC's public feed, with the stocks CNBC tags in each article. Market moves: Yahoo Finance daily prices, refreshed several times each weekday. Moves are price change only, without dividends.</p>
      ${meta ? `<p class="muted small">Last refresh ${esc(ago(meta.updated))} · prices through ${esc(fmtDay(meta.asOf))} · ${meta.tickers} tickers covered.</p>` : ''}
      ${meta?.warnings?.length ? `<p class="warn small">${meta.warnings.map(esc).join('<br />')}</p>` : ''}
      <p class="muted small">For fun and information, not financial advice. Not affiliated with CNBC, Jim Cramer, or the Philadelphia Eagles. Go Birds.</p>
      <div class="sheet-actions"><span class="spacer"></span><button type="button" class="btn" data-cancel>Done</button></div>
    </div>`,
    (dlg) => {
      dlg.querySelector('[data-cancel]').addEventListener('click', closeSheet);
      dlg.querySelector('[data-copy]').addEventListener('click', async () => {
        const text = JSON.stringify({ app: 'birdseye', v: 1, accounts, calls });
        try {
          await navigator.clipboard.writeText(text);
          toast('Backup copied. Paste it in Notes to keep it.');
        } catch {
          const box = dlg.querySelector('[data-restore-box]');
          box.hidden = false;
          const ta = dlg.querySelector('[data-restore-text]');
          ta.value = text;
          ta.select();
          toast('Copy the selected text to keep it.');
        }
      });
      dlg.querySelector('[data-restore]').addEventListener('click', () => {
        const box = dlg.querySelector('[data-restore-box]');
        box.hidden = false;
        dlg.querySelector('[data-restore-text]').focus();
      });
      dlg.querySelector('[data-restore-go]').addEventListener('click', () => {
        try {
          const b = JSON.parse(dlg.querySelector('[data-restore-text]').value);
          if (b?.app !== 'birdseye' || !Array.isArray(b.accounts) || !Array.isArray(b.calls)) throw new Error();
          const cleanAccts = b.accounts
            .filter((a) => a && typeof a.name === 'string' && Array.isArray(a.tickers))
            .map((a) => ({ id: String(a.id || uid()), name: a.name.slice(0, 40), tickers: a.tickers.map(normSym).filter(validSym) }));
          const cleanCalls = b.calls
            .filter((c) => c && validSym(normSym(c.sym)) && (c.dir === 'bull' || c.dir === 'bear') && /^\d{4}-\d{2}-\d{2}$/.test(c.base))
            .map((c) => ({ ...c, id: String(c.id || uid()), sym: normSym(c.sym), link: safeLink(c.link) || '' }));
          if (!confirm(`Replace what's on this phone with ${cleanAccts.length} accounts and ${cleanCalls.length} calls?`)) return;
          accounts = cleanAccts;
          calls = cleanCalls;
          saveAccounts();
          saveCalls();
          closeSheet();
          render();
          toast('Backup restored');
        } catch {
          toast("That doesn't look like a Bird's Eye backup.");
        }
      });
    },
  );
}

// ---------- routing & events ----------
function currentTab() {
  const h = location.hash.replace('#', '');
  return TABS.includes(h) ? h : 'cramer';
}
function render() {
  const tab = currentTab();
  for (const t of TABS) $(`#view-${t}`).hidden = t !== tab;
  document.querySelectorAll('.tabbar a').forEach((a) => {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const up = D.meta?.updated || D.quotes?.updated;
  $('#updated').textContent = up ? `Marc's market desk · updated ${ago(up)}` : "Marc's market desk";
  if (tab === 'cramer') renderCramer();
  else if (tab === 'accounts') renderAccounts();
  else renderMarket();
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  if (a === 'period') {
    prefs.period = +el.dataset.k;
    savePrefs();
    render();
  } else if (a === 'sub') {
    prefs.sub = el.dataset.sub;
    savePrefs();
    render();
  } else if (a === 'filter') {
    prefs.filter = el.dataset.f;
    segLimit = 20;
    savePrefs();
    render();
  } else if (a === 'more-segs') {
    segLimit += 20;
    render();
  } else if (a === 'track') openTrackSheet(el.dataset.seg);
  else if (a === 'add-call') openTrackSheet(null);
  else if (a === 'del-call') {
    if (!confirm('Stop tracking this call?')) return;
    calls = calls.filter((c) => c.id !== el.dataset.id);
    saveCalls();
    render();
  } else if (a === 'edit-account') openAccountSheet(el.dataset.id);
  else if (a === 'all-holdings') {
    showAllHoldings = !showAllHoldings;
    render();
  } else if (a === 'info') openInfoSheet();
});
sheet().addEventListener('click', (e) => {
  if (e.target === sheet()) closeSheet();
});
window.addEventListener('hashchange', () => {
  render();
  window.scrollTo(0, 0);
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && Date.now() - D.loadedAt > 10 * 60 * 1000) loadData();
});

if (prefs.filter === 'mine' && !accounts.length) prefs.filter = 'all';
render();
loadData();
