# Hindsight

A what-if time machine for money. "If you'd put **$30,000** into **Apple** in **Oct 2007**, you'd have..." and then one big, real number, the S&P 500 for comparison, and the chart of how it got there. Drag the slider at the bottom to move the start date and watch the number change.

**Open it:** https://annasoracco.github.io/marcsapp/ (any phone browser, no login, no setup)

## What's in it

- **The question.** Tap the amount, the investment, or the date in the sentence to change it. About 230 well-known stocks, ETFs, mutual funds, and Bitcoin and Ethereum, plus the S&P 500 itself. Old names work in search (Facebook finds Meta, Square finds Block, Google finds Alphabet).
- **The slider.** Docked at the bottom where your thumb is. Drag through time; year buttons and ‹ › arrows move precisely. The label over the thumb always says which month you're on.
- **The chart.** Your investment in midnight green, the S&P 500 (dividends reinvested) in silver, labeled at the ends. Slide a finger across it to read the value on any date shown.
- **In today's dollars.** One switch restates every dollar for inflation using CPI.
- **Would you have held?** It shows the high, then you drag a line to guess how far it fell. Then the crash and the climb back draw in, with the exact worst drop, the bottom, and how long it took to recover.
- **Moments.** Start the clock on market days (dot-com peak, the 2007 peak, the 2009 bottom, the COVID low, the first iPhone, ChatGPT) or Eagles days (both Super Bowl wins, the 2023 NFC title game, the Miracle at the New Meadowlands, 4th and 26). Save your own dates, like a birthday, too.
- **Surprise me.** Loads a dramatic real result from the data.
- **Share.** Makes a tall image card on the phone (number, chart, exact dates, and a "hypothetical" note), then opens the phone's share sheet or saves the image.
- **Mentioned on Mad Money this week.** Inside the stock picker only: stocks CNBC tagged in this week's Mad Money segments, with a link to each segment. They're mentions, not picks.

## How the math works

- Prices are Yahoo Finance **adjusted daily closes**, so dividends are reinvested and splits are handled. You buy at the first close on or after the start date and hold, with fractional shares, through the latest close. Pre-tax, no fees.
- A month on the slider means that investment's **first close of the month**. A moment means the **first close on or after** that day (the Super Bowl LII win on Sunday, Feb 4, 2018, uses Monday, Feb 5). An investment can't start before it existed: Meta starts at its first day of trading, May 18, 2012.
- Every result shows its exact window, for example "From the close on Oct 1, 2007 to the close on Nov 5, 2026."
- The S&P 500 comparison is the **S&P 500 Total Return index** (`^SP500TR`), bought at its first close on or after your start and valued at its last close on or before your end. Prices start in **January 1988**, when that index begins.
- **Crypto** trades every day, so Bitcoin and Ethereum use daily closes at midnight UTC.
- **Worst drop** is the biggest close-to-close fall from a high after you bought. "Recovered" means it closed back at that high.
- **Today's dollars:** CPI-U (FRED `CPIAUCSL`) for each date's month, through the latest published month. October 2025 was never published (federal shutdown), so it's filled in geometrically between September and November. In this mode, highs and lows are found on the inflation-adjusted values, so every number on the screen agrees.
- **Survivorship bias:** the list only holds investments that still exist. Companies that went bust or were bought out aren't in it, which makes history look rosier than it was. The app says so in the picker and next to Surprise me.

## Privacy

- **Pretend money only.** The app never asks about real accounts or balances.
- **Nothing you type leaves the phone.** The amount, investment, dates, and saved dates stay in this browser's local storage. Both data files load when the app opens, no matter what you pick, so the website never learns what you're looking at. Nothing goes in the URL.
- **No third parties at runtime:** fonts are self-hosted, there are no analytics or ads, and a Content Security Policy only allows the site's own address. The only outside links are the Mad Money segment links you choose to tap.
- **Earlier versions:** data left on the phone by "Marc's App" and "Bird's Eye" (which stored account details) is deleted on first open. Picks saved by "Marc vs. Cramer" are left alone.

## Put it on the home screen

- **iPhone (Safari):** open the link, tap **Share**, then **Add to Home Screen**.
- **Android (Chrome):** open the link, tap the **⋮** menu, then **Install app**.

## How the data works

There is no server. A GitHub Actions workflow (`.github/workflows/deploy.yml`) runs `scripts/fetch-data.mjs` and redeploys the static site to GitHub Pages after each US market close, once in the evening for Mad Money, on every push to `main`, and on demand. `keepalive.yml` stops GitHub from pausing the schedule.

- **What it builds:** `public/data/hindsight.json` (the popular investments, the S&P 500 daily series, CPI, moments, and mentions) and `hindsight-more.json` (everything else). Each investment ships its monthly closes plus precomputed, day-exact worst-drop details for every start month and moment.
- **Never fake data:** each run builds a candidate from one fresh Yahoo snapshot per investment (or that investment's last good snapshot), validates it, and only then publishes it. If validation fails, the last good dataset is republished. If none exists, the deploy stops and the live site stays as it was.
- **Bad adjustments are quarantined:** any one-day move above +50% or below -40% that isn't listed (with a reason) under `reviewedMoves` in [`config/hindsight.json`](config/hindsight.json) keeps that investment out until someone reviews it. A few histories start later on purpose (`from`), for example when Yahoo's early data is a different company or a penny-stock era.
- **Known Yahoo quirk:** Coca-Cola's adjusted history double-counts one September 2001 dividend, which overstates KO results that start before then by about 0.7%.

To add an investment, add it to `config/hindsight.json` and commit to `main`.

## Run it locally

Requires Node.js 22 or newer.

```bash
npm ci
npm run data          # fetch real prices into public/data (about 4 minutes)
npm run dev           # http://localhost:5173/marcsapp/
npm test              # unit, data-job, and golden math tests
npm run lint
npm run build         # static site in dist/
npm run e2e           # Playwright, phone-sized, Chromium and WebKit (BASE_URL=... to test the live site)
```

**Golden math tests** (`src/test/golden.test.ts`) check the app against numbers an independent script recomputed from raw Yahoo and FRED downloads (dividends, CPI, an IPO, a rename, weekends and holidays, crypto calendars, rounding). `scripts/make-golden-fixture.mjs` rebuilds the fixture from those raw files, so both sides use identical inputs. Yahoo's adjusted closes for dividend payers can differ by a few parts in ten million between requests.

## Not financial advice

For fun. Hypothetical, pre-tax, no fees, dividends reinvested. Not affiliated with CNBC, Jim Cramer, the NFL, or the Philadelphia Eagles. Data: Yahoo Finance, FRED.
