# Marc vs. Cramer

A season-long head-to-head with Jim Cramer. Every stock Cramer covers on Mad Money becomes a matchup: Marc confirms which way Cramer called it, makes his own pick, and the app keeps both records with standings, streaks, and a week-by-week log. **Percent moves only. No dollar amounts, ever.**

**Open it:** https://annasoracco.github.io/marcsapp/ (any phone browser, no login, no setup)

## How it works

- **The board.** The latest Mad Money segments, grouped by show night, with the stocks CNBC tagged in each one. The main stocks in a segment get their own row; the rest are one tap away.
- **Make a pick.** Tap a stock and the pick slip opens in place. Confirm Cramer's call (Bull or Bear), then make yours, then lock it in. When a headline is clear ("Sell AMC", "McKesson is a winner"), the app pre-highlights a suggested side with a dashed outline, but nothing is scored until Marc taps to confirm it. Stocks that weren't real calls can be taken off the board.
- **Scoring.** A matchup kicks off at the first market close after the pick is locked and goes final five trading days later. Bull wins if the stock beats the S&P 500 (SPY, dividends included) over that stretch; Bear wins if it trails. Cramer is scored over the same five days, so nobody gets a head start. When Marc and Cramer agree they win or lose together, so the race is decided by the calls where they split. Ties count as half a win. Seasons follow the calendar year.
- **In play and final.** Live matchups show the stock's move against the S&P 500 and who's ahead. Finals land in the season page with week-by-week records, the last 10 results, and Marc's biggest win and toughest loss.
- **Stocks you own.** Optional. Add tickers (no amounts) and any that Cramer talks about move to the top of the board.
- **Market line.** The S&P 500, Nasdaq, and Dow moves for the day sit quietly under the title.

## Privacy

- **No dollars.** The app never asks for or shows balances, share counts, or dollar values. Tests fail if a currency amount appears.
- **Marc's data stays on his phone.** Picks, Cramer's calls as Marc confirmed them, and owned tickers are saved in the browser's local storage. There is no server, no login, no analytics, and nothing is sent anywhere.
- **Switching phones:** the footer has **Save a backup** and **Restore a backup**.

## Put it on the home screen

- **iPhone (Safari):** open the link, tap **Share**, then **Add to Home Screen**.
- **Android (Chrome):** open the link, tap the **⋮** menu, then **Install app**.

## How the data works

There is no server. A scheduled GitHub Actions workflow (`.github/workflows/deploy.yml`) runs `scripts/fetch-data.mjs` and redeploys the static site to GitHub Pages:

- **When:** about every 30 minutes on weekdays while US markets are open, once after the close, once in the evening (after the show airs), on every push to `main`, and on demand (Actions > Data and deploy > Run workflow).
- **What:** prices and daily moves for about 1,800 tickers (S&P 500, 400, and 600, Nasdaq-100, popular ETFs, plus every stock CNBC tags on Mad Money), about two years of daily closes per ticker, and the Mad Money headlines from CNBC's official RSS feed with the stocks CNBC tagged in each article. It uses the [`yahoo-finance2`](https://github.com/gadicc/yahoo-finance2) package (no API key).
- **Resilience:** a failed fetch never breaks the deploy. The job falls back to the last good data. Only as a last resort does it publish clearly labeled sample prices, and while it does, the app scores nothing and says so.
- **Keeps running on its own:** `.github/workflows/keepalive.yml` stops GitHub from pausing the schedule after 60 quiet days.

To cover an extra ticker, add it to [`config/extra-tickers.json`](config/extra-tickers.json) and commit to `main`. To refresh index membership, run `npm run universe` and commit `config/universe.json`.

## Run it locally

Requires Node.js 22 or newer.

```bash
npm ci
npm run data          # fetch real market data into public/data (or: npm run data:sample)
npm run dev           # http://localhost:5173/marcsapp/
npm test              # unit tests (scoring, board, storage, privacy)
npm run lint
npm run build         # static site in dist/
npm run e2e           # Playwright smoke tests against a local preview (BASE_URL=... to test the live site)
```

Review screenshots: `SHOTS_DIR=/some/folder npx playwright test e2e/screenshots.spec.ts`. They use a demo season that is seeded only into the test browser ([`e2e/demo-season.ts`](e2e/demo-season.ts)): Cramer's sides come from real headlines, the picks are made up, and the results come from real prices.

## Not financial advice

A fan-made game for fun. Prices can be delayed or wrong. Not affiliated with, endorsed by, or connected to CNBC, Mad Money, Jim Cramer, or the NFL.
