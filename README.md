# Marc's App

A phone-first market companion built for Marc: track Jim Cramer's calls against the market, X-ray all your accounts as one portfolio, and see what's moving today. **In percentages only. No dollars, ever.**

**Open it:** https://annasoracco.github.io/marcsapp/ (works in any phone browser, no login, no setup)

## What it does

- **Cramer Call Tracker (home).** Log a call in a few taps: ticker (with autocomplete), Buy / Sell / Hold, the date it aired (back-dating up to about 2 years works), an optional segment such as Lightning Round, and a note. Each call shows the stock's return since the call next to the S&P 500 (SPY) over the exact same days, and whether it beat the market. The scorecard shows the hit rate, average edge versus the S&P 500, best and worst calls, and an **Inverse Cramer** comparison (what you'd have gotten doing the opposite of every call).
- **Account X-ray.** Add your accounts (Brokerage, Roth IRA, 401(k), HSA, and more). Enter holdings as ticker plus shares, or as a percent of the account (handy for 401(k) funds without tickers). See combined allocation, overlap (the same ticker in several accounts), concentration alerts (default 10%, adjustable), sector mix, asset type mix, per-account mix, and **true exposure**: what you really own once your ETFs' and index funds' top holdings are counted.
- **Today.** Your portfolio's weighted move today (as a percent), major indices, an 11-sector heat map of the SPDR sector ETFs, your biggest movers, and a watchlist with "since you added it" returns.
- **Earnings radar.** Upcoming earnings dates for your holdings, watchlist, and Cramer-call tickers.
- **From the show.** The latest Mad Money headlines from CNBC's official RSS feed (headline, date, and a link back to CNBC.com only).

## The privacy promise

- **No dollars, ever.** Accounts and holdings are shown only as percentages. Share counts appear only inside the account edit form. A unit test (`src/test/privacy.test.tsx`) renders the screens with sample data and fails if a currency amount shows up.
- **Your data stays on your phone.** Accounts, calls, and the watchlist are saved in your browser's local storage. There is no server, no login, no account linking, no analytics, and no trackers.
- **Moving phones:** More > Export backup saves a file; Import backup on the new phone restores it.

## Put it on your home screen

- **iPhone (Safari):** open the link, tap **Share**, then **Add to Home Screen**.
- **Android (Chrome):** open the link, tap the **⋮** menu, then **Install app**.

It then opens full-screen like a regular app and works offline with the last prices it saw.

## How the market data works

There is no server. A scheduled GitHub Actions workflow (`.github/workflows/deploy.yml`) fetches data and redeploys the static site to GitHub Pages:

- **When:** about every 30 minutes on weekdays while US markets are open, once after the close, once in the evening (for show headlines), on every push to `main`, and on demand (Actions > Data and deploy > Run workflow).
- **Keeps running on its own:** GitHub pauses schedules in public repos after 60 days without activity. `.github/workflows/keepalive.yml` runs every Monday, re-enables the schedules, and adds an empty commit once `main` has been quiet for 40 days. It uses only the built-in token.
- **What:** `scripts/fetch-data.mjs` uses the [`yahoo-finance2`](https://github.com/gadicc/yahoo-finance2) package (no API key) to write static JSON into the site:
  - `data/market.json`: latest price, daily % change, type, sector, and next earnings date for every covered ticker (every run).
  - `data/history/<TICKER>.json`: about 2 years of daily adjusted closes in a compact format, loaded on demand (refreshed once per trading day).
  - `data/funds.json`: top holdings and sector weights for ETFs and mutual funds, used for look-through (refreshed weekly).
  - `data/news.json`: Mad Money headlines from CNBC's official RSS feed, the stocks CNBC tagged in each article, and how each has moved since the segment aired. Tagged stocks stay covered for a year.
- **Resilience:** a failed fetch never breaks the deploy. The job falls back to the last good data (GitHub Actions cache, then the currently deployed site's data). Only as a last resort does it publish made-up sample prices, and the app then shows a clear "sample market data" banner. The header always shows "Prices as of …".

### Coverage, and how to add tickers

Covered: S&P 500, S&P MidCap 400, S&P SmallCap 600, Nasdaq-100, and Dow 30 stocks; stocks CNBC tags in Mad Money segments; major index, sector, bond, international, and thematic ETFs; common 401(k) mutual funds and Vanguard / Fidelity target-date funds; plus popular names in `config/extra-tickers.json` (about 1,800 tickers in total).

- **To add a ticker:** edit [`config/extra-tickers.json`](config/extra-tickers.json), add the symbol to the `tickers` list (Yahoo style, for example `BRK-B`), and commit to `main`. The next run picks it up and detects the type, name, and sector automatically.
- **To refresh index membership:** run `npm run universe` and commit `config/universe.json` (it reads the constituent tables on Wikipedia and the curated ETF and fund lists in `scripts/build-universe.mjs`).
- Tickers outside the list show as "not covered yet". Percent-entered holdings still count in the X-ray.

## Run it locally

Requires Node.js 22 or newer.

```bash
npm ci
npm run data          # fetch real market data into public/data (or: npm run data:sample)
npm run dev           # http://localhost:5173/marcsapp/
npm test              # unit tests, including the privacy guard
npm run lint
npm run build         # static site in dist/
npm run e2e           # Playwright smoke tests against a local preview (BASE_URL=... to test the live site)
```

## Hosting elsewhere

It's a plain static site, so it can also be deployed to Vercel, Netlify, or Cloudflare Pages: build with `npm run build` after `npm run data`, and serve `dist/`. The app expects to live under `/marcsapp/`; change `BASE` in `vite.config.ts` to serve it from the root. You'd also want a scheduled job (like the GitHub workflow here) to keep the data fresh.

## Not financial advice

This is a fan-made tracker for fun and learning. Prices can be delayed or wrong. It is not affiliated with, endorsed by, or connected to CNBC, Mad Money, or Jim Cramer.
