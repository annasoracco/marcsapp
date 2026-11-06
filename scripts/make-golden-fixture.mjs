#!/usr/bin/env node
// Builds src/test/fixtures/golden-dataset.json by running the production pipeline (snapshotFromChart,
// parseCpiCsv, assembleDataset) on raw Yahoo chart responses and a FRED CSV saved by an independent
// recomputation. Feeding both sides the exact same raw inputs makes the golden tests a test of the math:
// Yahoo's adjusted closes for dividend payers can differ by a few parts in 10 million between requests.
//
//   node scripts/make-golden-fixture.mjs <raw-dir> <fetched-at ISO time>
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assembleDataset, parseCpiCsv, snapshotFromChart } from "./fetch-data.mjs";

const [rawDir, fetchedAt] = process.argv.slice(2);
if (!rawDir || !fetchedAt) {
  console.error("usage: node scripts/make-golden-fixture.mjs <raw-dir> <fetched-at ISO time>");
  process.exit(1);
}
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const now = new Date(fetchedAt);
const config = JSON.parse(readFileSync(path.join(ROOT, "config", "hindsight.json"), "utf8"));
const SYMBOLS = ["^SP500TR", "AAPL", "KO", "META", "MSFT", "NVDA", "BTC-USD"];

const series = new Map();
for (const s of SYMBOLS) {
  const raw = JSON.parse(readFileSync(path.join(rawDir, `${s.replace(/\^/g, "_")}.json`), "utf8"));
  const r = raw.chart.result[0];
  const adj = r.indicators.adjclose[0].adjclose;
  // The same shape yahoo-finance2's chart() returns.
  const quotes = r.timestamp.map((t, i) => ({ date: new Date(t * 1000), adjclose: adj[i] }));
  const meta = {
    ...r.meta,
    currentTradingPeriod: { regular: { end: new Date(r.meta.currentTradingPeriod.regular.end * 1000) } },
  };
  series.set(s, snapshotFromChart({ meta, quotes }, s, now));
}
const cpi = parseCpiCsv(readFileSync(path.join(rawDir, "cpi.csv"), "utf8"));
const tickers = config.tickers.filter((t) => SYMBOLS.includes(t.s));
const ds = assembleDataset({ config, tickers, series, cpi, now });
const out = path.join(ROOT, "src", "test", "fixtures", "golden-dataset.json");
writeFileSync(out, JSON.stringify(ds));
console.log(`wrote ${out}: ${ds.t.length} assets, prices through ${ds.asOf}, CPI through ${ds.cpi.last}`);
