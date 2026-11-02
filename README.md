# Bird's Eye

A phone-first market companion built for Marc: the market in plain English, a scorecard for Jim Cramer's calls, and a look inside any fund. It never asks about your money.

**Open it:** https://annasoracco.github.io/marcsapp/ (any phone browser, no login, no setup)

## What it does

- **Briefing (home).** One sentence on the day ("Rough day for tech. The S&P 500 fell 1.8%, dragged by Nvidia and Broadcom."), the S&P move with a 5-day or 1-month line, index chips, **what moved the market** (each S&P 500 company's weight by market cap times its move, as diverging bars with a plain summary), all 11 sectors in one sorted list, **big reports this week** (stocks you watch and Cramer tickers first, then the largest companies), and a **Cramer check**.
- **Cramer.** Answers "Would following Cramer have beaten just buying the S&P?" with three bars (Follow Cramer, Do the opposite, Just buy the S&P) and a winner. Every term has a one-tap explainer. Calls are clean rows ("+7.6% vs market", Right or Wrong); tap one for a chart of the stock vs the S&P since the call, the note, Edit, and Delete. The floating + opens a sheet: pick a ticker, tap Buy, Sell, or Hold, pick Today, Yesterday, or a date.
- **Heard it on the show? Track it.** Headlines from CNBC's official Mad Money RSS feed that name a covered company become one-tap suggestions. The sheet opens prefilled and Marc picks the call himself. Nothing is created automatically, article pages are never scraped, and every suggestion links to the CNBC story.
- **Fund X-ray.** A research tool: look up any covered ETF or mutual fund (VOO, FXAIX, VTI, target-date funds, and more) to see what it is in plain English, its top holdings (target-date funds are opened up to show the companies inside), its sectors next to the S&P 500, and its performance over 1 month, this year, 1 year, and 2 years. **Compare** two or three funds to see how much they overlap ("VOO and FXAIX are almost the same fund: 98% overlap in their top holdings") and how they performed side by side.
- **Markets.** Indices, sectors, stocks you're watching (returns today, 1M, YTD, or 1Y vs the S&P), a two-week earnings calendar, and search for any covered ticker.

## Privacy: it never asks about your money

- There is **no** place to enter accounts, balances, holdings, share counts, or anything about what you own, and no brokerage import.
- The only things saved, on your phone only, are the Cramer calls you log (public information), the tickers you choose to watch (no amounts), and a couple of display settings.
- Older versions of the app could store accounts. On first load the new version **deletes** those old keys from the device and keeps only calls and the watchlist.
- No logins, no analytics, no trackers. Backups (Settings > Export backup) contain only calls, the watchlist, and settings.
- Tests enforce this: `src/test/privacy.test.tsx` fails if any screen has an input for shares, quantities, accounts, balances, or values, if a dollar amount appears outside a public per-share quote on a ticker page, if stored data has any field besides calls, watchlist, and settings, or if the migration leaves old account keys behind.

## Put it on your home screen

- **iPhone (Safari):** open the link, tap **Share**, then **Add to Home Screen**.
- **Android (Chrome):** open the link, tap the **⋮** menu, then **Install app**.

## How the market data works

There is no server. A scheduled GitHub Actions workflow (`.github/workflows/deploy.yml`) fetches data and redeploys the static site to GitHub Pages:

- **When:** about every 30 minutes on weekdays while US markets are open, once after the close, once in the evening (after Mad Money airs), on every push to `main`, and on demand (Actions > Data and deploy > Run workflow).
- **Keeps running on its own:** GitHub pauses schedules in public repos after 60 days without activity. `.github/workflows/keepalive.yml` runs every Monday, re-enables the schedules, and adds an empty commit once `main` has been quiet for 40 days. It uses only the built-in token.
- **What:** `scripts/fetch-data.mjs` uses [`yahoo-finance2`](https://github.com/gadicc/yahoo-finance2) (no API key) to write static JSON:
  - `data/market.json`: price, daily % change, type, sector, market cap (used only to weight S&P 500 contributions), S&P 500 membership, and next earnings date for every covered ticker (every run).
  - `data/history/<TICKER>.json`: about 2 years of daily adjusted closes, loaded on demand (refreshed once per trading day).
  - `data/funds.json`: published top holdings, sector weights, and stock/bond/cash split for ETFs and mutual funds (refreshed weekly).
  - `data/news.json`: Mad Money headlines from CNBC's official RSS feed, plus the stocks CNBC tags on each article and their move since it aired (tagged stocks stay covered for a year). The app's Track suggestions use only the headline text and always link to CNBC.
- **Resilience:** a failed fetch never breaks the deploy. The job falls back to the last good data (Actions cache, then the deployed site's data), and only as a last resort publishes clearly labelled sample prices.

### Coverage, and how to add tickers

About 1,800 tickers: S&P 500, S&P MidCap 400, S&P SmallCap 600, Nasdaq-100, and Dow 30 stocks; stocks CNBC tags in Mad Money segments; index, sector, bond, international, and thematic ETFs; common 401(k) mutual funds and Vanguard and Fidelity target-date funds; plus popular names in `config/extra-tickers.json`.

- **Add a ticker:** add it to the `tickers` list in [`config/extra-tickers.json`](config/extra-tickers.json) (Yahoo style, for example `BRK-B`) and commit to `main`.
- **Refresh index membership:** run `npm run universe` and commit `config/universe.json`.

## Run it locally

Requires Node.js 22 or newer.

```bash
npm ci
npm run data          # real market data into public/data (or: npm run data:sample)
npm run dev           # http://localhost:5173/marcsapp/
npm test              # unit tests: insights, funds, headline matching, privacy guard, migration
npm run lint
npm run build         # static site in dist/
npm run e2e           # Playwright smoke tests at 320, 390, and 430px (BASE_URL=... for the live site)
```

## Hosting elsewhere

It's a plain static site, so it also deploys to Vercel, Netlify, or Cloudflare Pages: run `npm run data` then `npm run build` and serve `dist/`. It expects to live under `/marcsapp/`; change `BASE` in `vite.config.ts` to serve it from the root. Keep a scheduled job like the GitHub workflow here so the data stays fresh.

## Not financial advice

A fan-made tracker for fun and learning. Prices can be delayed or wrong. Not affiliated with, endorsed by, or connected to CNBC, Mad Money, Jim Cramer, or any team.
