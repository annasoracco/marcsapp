# marcsapp: Bird's Eye

A market desk for Marc, live at **https://annasoracco.github.io/marcsapp/**. Everything is in percentages. It never asks for or shows balances, share counts, or dollar amounts.

## What it does

- **Cramer desk**: the latest Mad Money segments from CNBC's public feed, with the stocks CNBC tagged in each article and how they've moved since it aired. Tap **Track a call**, pick the stock, and choose bullish or bearish. The call tracker shows whether each call is working and how it compares with the S&P 500 over the same stretch.
- **Account X-ray**: add each account by nickname and the tickers in it. See which holdings repeat across accounts, the sector mix, how each holding is moving, and which of your stocks Cramer has talked about.
- **Market pulse**: major indexes, breadth, sectors, industries, the biggest S&P 500 movers, and gold, oil, Bitcoin, and Treasuries. Today, 1W, 1M, 3M, YTD, or 1Y.

## Privacy

Accounts and tracked calls are saved only in the browser on Marc's phone (localStorage). They are never sent anywhere or stored in this repo. The About screen has a copy and restore backup option.

## How it works

- `site/` is a static app (plain HTML, CSS, and JavaScript, no build step).
- `scripts/build-data.mjs` fetches free, keyless public data and writes JSON to `site/data/` (not committed):
  - Mad Money segments: CNBC's RSS feed, plus each article's tagged tickers.
  - Daily prices: Yahoo Finance chart data for the S&P 500, 400, and 600, the Nasdaq-100, popular ETFs and funds (`scripts/universe.mjs`), and every stock tagged in a segment.
  - Index lists: Wikipedia.
- `.github/workflows/deploy.yml` runs the script and deploys to GitHub Pages on every push to `main`, several times each weekday, and once on Sundays. Run it by hand from the Actions tab with **Run workflow**.

Run locally:

```sh
node scripts/build-data.mjs site/data
npx serve site   # or any static file server
```

Moves are price change only, without dividends. For fun and information, not financial advice. Not affiliated with CNBC, Jim Cramer, or the Philadelphia Eagles.
