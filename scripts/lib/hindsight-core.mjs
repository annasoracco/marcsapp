// Pure helpers for the Hindsight data job. No I/O here so they can be unit tested.
//
// Definitions (shared with the app and the golden tests):
// - A series is one asset's daily closes in its own calendar (NYSE days for US securities, UTC days for crypto).
//   Prices are Yahoo adjusted closes, so dividends are reinvested and splits are handled.
// - Monthly anchor: the asset's first close in each calendar month.
// - Moment start: the asset's first close on or after the event date. If the asset hadn't started trading by
//   the event date, the moment is unavailable (never shifted to a later IPO).
// - From start index s through the latest close N, over a series x (nominal, or real = close / CPI of that month):
//   drawdown = running max R_t = max x[s..t] (peak index = latest index attaining it); DD_t = x_t / R_t - 1
//              trough = first t minimizing DD_t; peak = running-max index at the trough;
//              recovery = first t > trough with x_t >= x_peak (none if it hasn't happened)

export const BASE_MONTH = "1988-01";

/**
 * Rounds to 10 significant digits. Enough that a whole-dollar result computed from the stored prices
 * matches one computed from Yahoo's raw floats for any outcome up to tens of millions of dollars.
 */
export const sig10 = (x) => Number(Number(x).toPrecision(10));

export const ymdInt = (iso) => Number(iso.slice(0, 4) + iso.slice(5, 7) + iso.slice(8, 10));

/** Month index since BASE_MONTH for "YYYY-MM" or "YYYY-MM-DD". */
export function monthIndex(iso) {
  return (Number(iso.slice(0, 4)) - 1988) * 12 + (Number(iso.slice(5, 7)) - 1);
}

export function monthIso(mi) {
  const y = 1988 + Math.floor(mi / 12);
  const m = (((mi % 12) + 12) % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

/** Calendar date ("YYYY-MM-DD") of an instant in an IANA time zone. */
export function dateInZone(instant, timeZone) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(instant)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
}

/** First index i with dates[i] >= iso, or -1. dates must be sorted ascending. */
export function firstOnOrAfter(dates, iso) {
  let lo = 0;
  let hi = dates.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (dates[mid] < iso) lo = mid + 1;
    else hi = mid;
  }
  return lo < dates.length ? lo : -1;
}

/** Last index i with dates[i] <= iso, or -1. */
export function lastOnOrBefore(dates, iso) {
  const i = firstOnOrAfter(dates, iso);
  if (i === -1) return dates.length - 1;
  return dates[i] === iso ? i : i - 1;
}

/**
 * Index of each month's first close, from the asset's first month (not before BASE_MONTH) to its last month.
 * Months with no close (e.g. a long halt) get -1.
 */
export function monthlyAnchors(dates) {
  const startIdx = firstOnOrAfter(dates, `${BASE_MONTH}-01`);
  if (startIdx === -1) return { m0: 0, idx: [] };
  const m0 = monthIndex(dates[startIdx]);
  const mLast = monthIndex(dates[dates.length - 1]);
  const idx = new Array(mLast - m0 + 1).fill(-1);
  for (let i = startIdx; i < dates.length; i++) {
    const k = monthIndex(dates[i]) - m0;
    if (idx[k] === -1) idx[k] = i;
  }
  return { m0, idx };
}

/** Start index for a moment, or -1 if the asset hadn't started trading by then (or the gap is suspiciously long). */
export function momentStart(dates, eventIso, maxGapDays = 10) {
  if (!dates.length || dates[0] > eventIso) return -1;
  const i = firstOnOrAfter(dates, eventIso);
  if (i === -1) return -1;
  const gap = (Date.parse(dates[i]) - Date.parse(eventIso)) / 86400000;
  return gap <= maxGapDays ? i : -1;
}

/** Max drawdown episode from start s through the end of x. See the definitions above. */
export function startStats(x, s) {
  const n = x.length;
  let runMax = x[s];
  let runMaxI = s;
  let worst = 0;
  let trough = -1;
  let peak = -1;
  for (let t = s; t < n; t++) {
    const v = x[t];
    if (v >= runMax) {
      runMax = v;
      runMaxI = t;
    }
    const dd = v / runMax - 1;
    if (dd < worst) {
      worst = dd;
      trough = t;
      peak = runMaxI;
    }
  }
  let rec = -1;
  if (trough >= 0) {
    const target = x[peak];
    for (let t = trough + 1; t < n; t++) {
      if (x[t] >= target) {
        rec = t;
        break;
      }
    }
  }
  return { peak, trough, rec, worst };
}

/** CPI (monthly, starting at month index m0) for a date, carrying the latest published month forward. */
export function cpiLookup(cpi) {
  const last = cpi.v.length - 1;
  return (iso) => {
    const k = monthIndex(iso) - cpi.m0;
    return cpi.v[Math.max(0, Math.min(last, k))];
  };
}

/** Big one-day moves in an adjusted series, used to quarantine broken corporate-action adjustments. */
export function bigMoves(dates, closes, up = 0.5, down = -0.4) {
  const out = [];
  for (let i = 1; i < closes.length; i++) {
    const r = closes[i] / closes[i - 1] - 1;
    if (r >= up || r <= down) out.push({ date: dates[i], move: Number(r.toFixed(4)) });
  }
  return out;
}

/**
 * Builds the app's record for one asset from its daily series.
 * Events (low/peak/trough/recovery days) are deduplicated into `ev`; per-start tuples are run-length encoded
 * over consecutive months because many start months share the same episode.
 * Per-start tuple: [peakEv, troughEv, recoveryEv], -1 when absent. N = nominal, R = real (CPI-adjusted).
 * Moments: { [id]: [startDay, startClose, ...nominal tuple, ...real tuple] }, only for moments the asset traded through.
 * ipo: the series starts at the asset's real first trading day (not at a data cut-off).
 * Dates are epoch days (days since 1970-01-01).
 */
export function buildAsset({ info, dates, closes, cpiAt, moments }) {
  const { m0, idx } = monthlyAnchors(dates);
  if (!idx.length) return null;
  const real = closes.map((c, i) => c / cpiAt(dates[i]));
  const events = new Map();
  const ev = (i) => {
    if (i < 0) return -1;
    if (!events.has(i)) events.set(i, events.size);
    return events.get(i);
  };
  const tuple = (x, s) => {
    const r = startStats(x, s);
    return [ev(r.peak), ev(r.trough), ev(r.rec)];
  };
  const rle = (x) => {
    const runs = [];
    for (const s of idx) {
      const t = s < 0 ? [-1, -1, -1] : tuple(x, s);
      const last = runs[runs.length - 1];
      if (last && last[1] === t[0] && last[2] === t[1] && last[3] === t[2]) last[0]++;
      else runs.push([1, ...t]);
    }
    return runs;
  };
  const N = rle(closes);
  const R = rle(real);
  // Keyed by moment id (not position), so a data shard from another deploy can never mislabel a moment.
  const mo = {};
  for (const m of moments) {
    const s = momentStart(dates, m.date);
    if (s >= 0) mo[m.id] = [epochDay(dates[s]), sig10(closes[s]), ...tuple(closes, s), ...tuple(real, s)];
  }
  const day = (i) => (i < 0 ? "0" : Number(dates[i].slice(8, 10)).toString(36));
  const evOut = [...events.entries()].sort((a, b) => a[1] - b[1]).map(([i]) => [epochDay(dates[i]), sig10(closes[i])]);
  const last = dates.length - 1;
  return {
    s: info.s,
    n: info.n,
    k: info.k,
    ...(info.a?.length ? { a: info.a } : {}),
    ...(info.pop ? { pop: 1 } : {}),
    ...(info.philly ? { philly: 1 } : {}),
    ...(info.ipo ? { ipo: 1 } : {}),
    first: epochDay(dates[0]),
    m0,
    d: idx.map(day).join(""),
    c: logDeltas(idx.map((i) => (i < 0 ? null : closes[i]))),
    end: [epochDay(dates[last]), sig10(closes[last])],
    ev: evOut,
    N,
    R,
    mo,
  };
}

/** Days since 1970-01-01 for "YYYY-MM-DD". */
export const epochDay = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400000);

/**
 * Compact, drift-free encoding of a price series: each value is round(ln(price) * 1e8) and we store the
 * differences between consecutive non-null values. Decoding is a running integer sum, so there is no
 * accumulated rounding error; the reconstructed price is within 5e-9 (relative) of the original.
 */
export const LOG_SCALE = 1e8;
export function logDeltas(values) {
  let prev = 0;
  return values.map((x) => {
    if (x == null) return null;
    const v = Math.round(Math.log(x) * LOG_SCALE);
    const d = v - prev;
    prev = v;
    return d;
  });
}

export function fromLogDeltas(deltas) {
  let acc = 0;
  return deltas.map((d) => {
    if (d == null) return null;
    acc += d;
    return Math.exp(acc / LOG_SCALE);
  });
}

/** Day-delta encoding for a long daily series (used for the S&P 500 comparison line). */
export function encodeDaily(dates, closes) {
  const d = dates.map((x, i) => (i === 0 ? 0 : Math.round((Date.parse(x) - Date.parse(dates[i - 1])) / 86400000)));
  return { b: dates[0], d, c: closes.map(sig10) };
}

