# Product

**Name:** Bird's Eye (repo and URL stay `marcsapp`)

**Who:** Marc, a personal-finance enthusiast with several brokerage and retirement accounts who watches Jim Cramer's Mad Money and is an Eagles fan. Not a developer. Uses it on his phone, usually in the evening after the close or during the show.

**Job:** In ten seconds, tell him how the market did, why his money moved (in percent), what is coming up that matters to him, and how Cramer's calls are doing. Then let him drill in.

**Surfaces:** Briefing (home), Cramer (call tracker), X-ray (what you really own), Markets (indices, sectors, watchlist, earnings, search). Settings behind a header icon. Mode: Operate.

**Hard constraints**
- Never show dollar amounts for holdings, accounts, or the portfolio. Percentages only. Per-share prices of public tickers only on ticker detail. Share counts only inside the account editor.
- Data stays on the device (localStorage). Backup export/import. No accounts, trackers, or analytics.
- Insights are deterministic and rule-based, covered by unit tests. No LLM.
- Cramer calls are logged by Marc. Headlines come only from CNBC's official Mad Money RSS (headline, date, link). Never scrape article pages, never auto-create calls.
- Not financial advice note stays visible.
- Low-key Eagles: midnight green #004C54 and silver #A5ACAF, no team or network logos or trademarks.
- WCAG AA, 44px touch targets, visible focus, plain-English copy, no em dashes in UI copy.
