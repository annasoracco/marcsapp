// Cross-account X-ray. Everything returned here is a fraction of the portfolio or of an
// account. Dollar values are used only transiently to weight share-based holdings and never
// leave this module.
import type { Account, Holding } from "./types";
import type { FundsFile, MarketFile } from "./marketTypes";

export type AssetType = "Stock" | "ETF" | "Mutual fund" | "Cash" | "Other";

export interface Slice {
  label: string;
  weight: number;
}

export interface AccountPosition {
  key: string;
  label: string;
  symbol?: string;
  type: AssetType;
  covered: boolean;
  weight: number;
}

export interface AccountMix {
  account: Account;
  /** Share of the whole portfolio. */
  weight: number;
  estimatedWeight: boolean;
  positions: AccountPosition[];
  /** Part of the account with no holding assigned. */
  unassigned: number;
  types: Slice[];
  warnings: string[];
}

export interface CombinedPosition {
  key: string;
  label: string;
  symbol?: string;
  name?: string;
  type: AssetType;
  covered: boolean;
  weight: number;
  accounts: { id: string; name: string; weight: number }[];
}

export interface Exposure {
  symbol: string;
  name: string;
  total: number;
  direct: number;
  via: { fund: string; weight: number }[];
}

export interface Xray {
  accounts: AccountMix[];
  positions: CombinedPosition[];
  overlap: CombinedPosition[];
  concentration: CombinedPosition[];
  sectors: Slice[];
  assetTypes: Slice[];
  assetClasses: Slice[];
  exposures: Exposure[];
  exposureAlerts: Exposure[];
  /** Portion of the portfolio in funds we could look through. */
  lookThroughShare: number;
  /** Portion of fund money beyond the published top holdings. */
  otherFundHoldings: number;
}

export const UNASSIGNED_KEY = "UNASSIGNED";
const CASH_KEY = "CASH";
const ALIASES: Record<string, string> = { GOOG: "GOOGL", "BRK-A": "BRK-B", FOX: "FOXA", NWS: "NWSA" };

export function typeOf(symbol: string | undefined, market: MarketFile): AssetType {
  const k = symbol ? market.t[symbol]?.k : undefined;
  if (k === "s") return "Stock";
  if (k === "e") return "ETF";
  if (k === "f") return "Mutual fund";
  if (k === "m") return "Cash";
  return "Other";
}

function holdingKey(h: Holding, market: MarketFile): { key: string; label: string; symbol?: string; covered: boolean; type: AssetType } {
  if (h.kind === "cash") return { key: CASH_KEY, label: "Cash", covered: true, type: "Cash" };
  const sym = h.symbol.trim();
  const upper = sym.toUpperCase();
  if (market.t[upper]) {
    const type = typeOf(upper, market);
    return { key: type === "Cash" ? CASH_KEY : upper, label: type === "Cash" ? "Cash" : upper, symbol: type === "Cash" ? undefined : upper, covered: true, type };
  }
  return { key: `LABEL:${sym.toLowerCase()}`, label: sym || "Unnamed holding", covered: false, type: "Other" };
}

interface Composition {
  positions: AccountPosition[];
  unassigned: number;
  /** Relative size, only defined when share counts make it computable. Internal only. */
  relSize?: number;
  warnings: string[];
}

export function composeAccount(account: Account, market: MarketFile): Composition {
  const warnings: string[] = [];
  const pctHoldings = account.holdings.filter((h): h is Extract<Holding, { pct: number }> => h.kind !== "shares");
  const shareHoldings = account.holdings.filter((h): h is Extract<Holding, { kind: "shares" }> => h.kind === "shares");
  let pctSum = pctHoldings.reduce((a, h) => a + Math.max(0, h.pct || 0), 0) / 100;
  let pctScale = 1;
  if (pctSum > 1.0001) {
    warnings.push("Percentages add up to more than 100%, so they were scaled down to fit.");
    pctScale = 1 / pctSum;
    pctSum = 1;
  }

  let shareTotal = 0;
  const shareVals: { h: Extract<Holding, { kind: "shares" }>; v: number }[] = [];
  for (const h of shareHoldings) {
    const price = market.t[h.symbol]?.p;
    if (!price || !(h.shares > 0)) {
      if (!price) warnings.push(`${h.symbol || "A holding"} has no price yet. Enter it as a % of the account instead.`);
      continue;
    }
    const v = h.shares * price;
    shareTotal += v;
    shareVals.push({ h, v });
  }

  const merged = new Map<string, AccountPosition>();
  const addPos = (h: Holding, w: number) => {
    if (w <= 0) return;
    const info = holdingKey(h, market);
    const prev = merged.get(info.key);
    if (prev) prev.weight += w;
    else merged.set(info.key, { ...info, weight: w });
  };
  for (const h of pctHoldings) addPos(h, (Math.max(0, h.pct || 0) / 100) * pctScale);
  const shareFrac = shareTotal > 0 ? Math.max(0, 1 - pctSum) : 0;
  if (shareTotal > 0 && shareFrac === 0) warnings.push("Share-based holdings were left out because percentages already fill the account.");
  for (const { h, v } of shareVals) addPos(h, (shareFrac * v) / shareTotal);

  const unassigned = shareTotal > 0 ? 0 : Math.max(0, 1 - pctSum);
  const positions = [...merged.values()].sort((a, b) => b.weight - a.weight);
  return {
    positions,
    unassigned: unassigned < 0.0005 ? 0 : unassigned,
    relSize: shareTotal > 0 && pctSum < 0.999 ? shareTotal / (1 - pctSum) : undefined,
    warnings,
  };
}

/** Weights of each account in the whole portfolio, summing to 1. */
export function accountWeights(comps: { account: Account; relSize?: number }[]): { weight: number; estimated: boolean }[] {
  const n = comps.length;
  if (!n) return [];
  const fixed = comps.map((c) => (c.account.portfolioPct && c.account.portfolioPct > 0 ? c.account.portfolioPct / 100 : undefined));
  const fixedSum = fixed.reduce<number>((a, f) => a + (f ?? 0), 0);
  const autoTotal = comps.reduce((a, c, i) => a + (fixed[i] === undefined && c.relSize ? c.relSize : 0), 0);
  const remaining = Math.max(0, 1 - fixedSum);

  const raw: (number | undefined)[] = comps.map((c, i) => {
    if (fixed[i] !== undefined) return fixed[i];
    if (c.relSize && autoTotal > 0) return remaining * (c.relSize / autoTotal);
    return undefined;
  });
  const known = raw.filter((x): x is number => x !== undefined && x > 0);
  const fill = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1 / n;
  const filled = raw.map((x) => (x === undefined || x <= 0 ? fill : x));
  const sum = filled.reduce((a, b) => a + b, 0);
  return filled.map((w, i) => ({ weight: sum > 0 ? w / sum : 1 / n, estimated: raw[i] === undefined || raw[i]! <= 0 }));
}

function toSlices(map: Map<string, number>): Slice[] {
  return [...map.entries()]
    .filter(([, w]) => w > 0.00005)
    .map(([label, weight]) => ({ label, weight }))
    .sort((a, b) => b.weight - a.weight);
}

function bump(map: Map<string, number>, key: string, w: number) {
  map.set(key, (map.get(key) ?? 0) + w);
}

export function buildXray(accounts: Account[], market: MarketFile, funds: FundsFile, thresholdPct: number): Xray {
  const comps = accounts.map((account) => ({ account, ...composeAccount(account, market) }));
  const weights = accountWeights(comps);

  const combined = new Map<string, CombinedPosition>();
  const accountMixes: AccountMix[] = comps.map((c, i) => {
    const w = weights[i].weight;
    for (const p of c.positions) {
      const prev = combined.get(p.key) ?? {
        key: p.key,
        label: p.label,
        symbol: p.symbol,
        name: p.symbol ? market.t[p.symbol]?.n : undefined,
        type: p.type,
        covered: p.covered,
        weight: 0,
        accounts: [],
      };
      prev.weight += w * p.weight;
      prev.accounts.push({ id: c.account.id, name: c.account.name, weight: w * p.weight });
      combined.set(p.key, prev);
    }
    if (c.unassigned > 0) {
      const prev = combined.get(UNASSIGNED_KEY) ?? { key: UNASSIGNED_KEY, label: "Not assigned", type: "Other" as AssetType, covered: false, weight: 0, accounts: [] };
      prev.weight += w * c.unassigned;
      prev.accounts.push({ id: c.account.id, name: c.account.name, weight: w * c.unassigned });
      combined.set(UNASSIGNED_KEY, prev);
    }
    const types = new Map<string, number>();
    for (const p of c.positions) bump(types, p.type, p.weight);
    if (c.unassigned > 0) bump(types, "Not assigned", c.unassigned);
    return {
      account: c.account,
      weight: w,
      estimatedWeight: weights[i].estimated,
      positions: c.positions,
      unassigned: c.unassigned,
      types: toSlices(types),
      warnings: c.warnings,
    };
  });

  const positions = [...combined.values()].filter((p) => p.weight > 0).sort((a, b) => b.weight - a.weight);
  const real = positions.filter((p) => p.key !== UNASSIGNED_KEY);
  const threshold = thresholdPct / 100;

  const sectors = new Map<string, number>();
  const assetTypes = new Map<string, number>();
  const assetClasses = new Map<string, number>();
  for (const p of positions) {
    bump(assetTypes, p.key === UNASSIGNED_KEY ? "Not assigned" : p.type, p.weight);
    if (p.key === UNASSIGNED_KEY) {
      bump(sectors, "Not assigned", p.weight);
      bump(assetClasses, "Not assigned", p.weight);
      continue;
    }
    if (p.type === "Cash") {
      bump(sectors, "Cash", p.weight);
      bump(assetClasses, "Cash", p.weight);
      continue;
    }
    if (!p.covered || !p.symbol) {
      bump(sectors, "Unknown", p.weight);
      bump(assetClasses, "Unknown", p.weight);
      continue;
    }
    if (p.type === "Stock") {
      bump(sectors, market.t[p.symbol]?.sec ?? "Unknown", p.weight);
      bump(assetClasses, "Stocks", p.weight);
      continue;
    }
    const f = funds.f[p.symbol];
    if (!f) {
      bump(sectors, "Funds (no breakdown)", p.weight);
      bump(assetClasses, "Funds (no breakdown)", p.weight);
      continue;
    }
    const total = f.st + f.bd + f.ca + f.ot || 1;
    const st = f.st / total;
    const secTotal = Object.values(f.sec).reduce((a, b) => a + b, 0);
    if (st > 0) {
      if (secTotal > 0) for (const [s, v] of Object.entries(f.sec)) bump(sectors, s, (p.weight * st * v) / secTotal);
      else bump(sectors, "Funds (no breakdown)", p.weight * st);
    }
    if (f.bd > 0) bump(sectors, "Bonds", (p.weight * f.bd) / total);
    if (f.ca > 0) bump(sectors, "Cash", (p.weight * f.ca) / total);
    if (f.ot > 0) bump(sectors, "Other", (p.weight * f.ot) / total);
    bump(assetClasses, "Stocks", p.weight * st);
    if (f.bd > 0) bump(assetClasses, "Bonds", (p.weight * f.bd) / total);
    if (f.ca > 0) bump(assetClasses, "Cash", (p.weight * f.ca) / total);
    if (f.ot > 0) bump(assetClasses, "Other", (p.weight * f.ot) / total);
  }

  // Look-through: direct stock positions plus each fund's published top holdings.
  const exp = new Map<string, { direct: number; via: Map<string, number>; name: string }>();
  let lookThroughShare = 0;
  let otherFundHoldings = 0;
  const addExp = (sym: string, name: string, w: number, fund?: string) => {
    const s = ALIASES[sym] ?? sym;
    const e = exp.get(s) ?? { direct: 0, via: new Map(), name: market.t[s]?.n ?? name ?? s };
    if (fund) e.via.set(fund, (e.via.get(fund) ?? 0) + w);
    else e.direct += w;
    exp.set(s, e);
  };
  const explode = (fund: string, rootFund: string, w: number, depth: number) => {
    const f = funds.f[fund];
    if (!f) return false;
    let named = 0;
    for (const [h, hw, hn] of f.h) {
      if (!h || hw <= 0) continue;
      named += hw;
      if (depth < 2 && funds.f[h] && h !== fund) {
        if (!explode(h, rootFund, w * hw, depth + 1)) otherFundHoldings += w * hw;
      } else if (market.t[h]?.k === "s" || (!funds.f[h] && !/^[A-Z]{4}X$/.test(h))) {
        addExp(h, hn, w * hw, rootFund);
      } else {
        otherFundHoldings += w * hw;
      }
    }
    const equityAndRest = Math.max(0, 1 - named);
    otherFundHoldings += w * equityAndRest;
    return true;
  };
  for (const p of real) {
    if (!p.symbol) continue;
    if (p.type === "Stock") addExp(p.symbol, p.name ?? p.symbol, p.weight);
    else if (p.type === "ETF" || p.type === "Mutual fund") {
      if (explode(p.symbol, p.symbol, p.weight, 0)) lookThroughShare += p.weight;
    }
  }
  const exposures: Exposure[] = [...exp.entries()]
    .map(([symbol, e]) => {
      const via = [...e.via.entries()].map(([fund, weight]) => ({ fund, weight })).sort((a, b) => b.weight - a.weight);
      return { symbol, name: e.name, direct: e.direct, via, total: e.direct + via.reduce((a, v) => a + v.weight, 0) };
    })
    .sort((a, b) => b.total - a.total);

  return {
    accounts: accountMixes,
    positions,
    overlap: real.filter((p) => p.accounts.length > 1),
    concentration: real.filter((p) => p.weight > threshold),
    sectors: toSlices(sectors),
    assetTypes: toSlices(assetTypes),
    assetClasses: toSlices(assetClasses),
    exposures,
    exposureAlerts: exposures.filter((e) => e.total > threshold && e.via.length > 0),
    lookThroughShare,
    otherFundHoldings,
  };
}
