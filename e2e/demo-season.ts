// Demo season for review screenshots ONLY. It is seeded into the Playwright browser's storage and is never part
// of the app or the deployed site. Cramer's side on each matchup comes from a real Mad Money headline (linked);
// Marc's picks are made up for the demo. Results are computed by the app from real price history.
const STORAGE_KEY = "marc-vs-cramer:v1";

type Side = "bull" | "bear";

interface DemoPick {
  s: string;
  n: string;
  air: string;
  title: string;
  link: string;
  cramer: Side;
  marc: Side;
  /** when the demo pick was "locked" (ET wall time, ISO with offset) */
  at: string;
  kick: string;
}

const PICKS: DemoPick[] = [
  {
    s: "ESI",
    n: "Element Solutions",
    air: "2026-10-13",
    title: "Cramer's lightning round: 'Hold on to Element Solutions'",
    link: "https://www.cnbc.com/2026/10/13/cramers-lightning-round-hold-on-to-element-solutions.html",
    cramer: "bull",
    marc: "bull",
    at: "2026-10-13T22:30:00-04:00",
    kick: "2026-10-14",
  },
  {
    s: "MCK",
    n: "McKesson",
    air: "2026-10-14",
    title: "Cramer's lightning round: 'McKesson is a winner'",
    link: "https://www.cnbc.com/2026/10/14/cramers-lightning-round-mckesson-is-a-winner.html",
    cramer: "bull",
    marc: "bull",
    at: "2026-10-14T23:30:00-04:00",
    kick: "2026-10-15",
  },
  {
    s: "RDDT",
    n: "Reddit",
    air: "2026-10-15",
    title: "Cramer's lightning round: Buy Reddit",
    link: "https://www.cnbc.com/2026/10/15/cramers-lightning-round-buy-reddit.html",
    cramer: "bull",
    marc: "bear",
    at: "2026-10-15T23:30:00-04:00",
    kick: "2026-10-16",
  },
  {
    s: "VFC",
    n: "V.F.",
    air: "2026-10-15",
    title: "Looking for non-AI stocks to own? Jim Cramer thinks these 2 names are worth buying",
    link: "https://www.cnbc.com/2026/10/15/cramer-vf-corp-kontoor-brands.html",
    cramer: "bull",
    marc: "bull",
    at: "2026-10-16T09:00:00-04:00",
    kick: "2026-10-16",
  },
  {
    s: "KTB",
    n: "Kontoor Brands",
    air: "2026-10-15",
    title: "Looking for non-AI stocks to own? Jim Cramer thinks these 2 names are worth buying",
    link: "https://www.cnbc.com/2026/10/15/cramer-vf-corp-kontoor-brands.html",
    cramer: "bull",
    marc: "bear",
    at: "2026-10-16T09:00:00-04:00",
    kick: "2026-10-16",
  },
  {
    s: "AVGO",
    n: "Broadcom",
    air: "2026-10-28",
    title: "Cramer's lightning round: 'Broadcom has been one of the greatest performers of all time'",
    link: "https://www.cnbc.com/2026/10/28/cramers-lightning-round-broadcom-has-been-one-of-the-greatest-performers-of-all-time.html",
    cramer: "bull",
    marc: "bear",
    at: "2026-10-28T22:00:00-04:00",
    kick: "2026-10-29",
  },
  {
    s: "AMC",
    n: "AMC Entertainment",
    air: "2026-10-29",
    title: "Cramer's lightning round: Sell AMC",
    link: "https://www.cnbc.com/2026/10/29/cramers-lightning-round-sell-amc.html",
    cramer: "bear",
    marc: "bear",
    at: "2026-10-29T23:30:00-04:00",
    kick: "2026-10-30",
  },
];

/** STZ is "locked" at screenshot time, so it shows as waiting for its kickoff. */
function pendingPick(now: Date): DemoPick {
  const et = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(now));
  let d = et.format(now);
  const wd = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
  const next = (iso: string) => new Date(Date.parse(`${iso}T12:00:00Z`) + 86400000).toISOString().slice(0, 10);
  if (wd(d) === 0 || wd(d) === 6 || hour >= 16) {
    d = next(d);
    while (wd(d) === 0 || wd(d) === 6) d = next(d);
  }
  return {
    s: "STZ",
    n: "Constellation Brands",
    air: "2026-10-30",
    title: "Jim Cramer says it's time to look beyond tech. Here are 4 consumer stocks he likes",
    link: "https://www.cnbc.com/2026/10/30/jim-cramer-consumer-staples-stocks.html",
    cramer: "bull",
    marc: "bull",
    at: now.toISOString(),
    kick: d,
  };
}

export function demoState(now = new Date()) {
  const games: Record<string, unknown> = {};
  for (const p of [...PICKS, pendingPick(now)]) {
    const id = `${p.air}|${p.s}`;
    games[id] = { id, ...p, at: new Date(p.at).toISOString() };
  }
  return { games, hidden: [], owned: ["AAPL", "COST", "KO", "MSFT"] };
}

export const DEMO_STORAGE_KEY = STORAGE_KEY;
