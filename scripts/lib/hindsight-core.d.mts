// Types for the data job's pure helpers, so the app's TypeScript tests can build fixtures with the real encoder.
import type { RawAsset } from "../../src/lib/data";

export const BASE_MONTH: string;
export const LOG_SCALE: number;
export function sig10(x: number): number;
export function ymdInt(iso: string): number;
export function epochDay(iso: string): number;
export function monthIndex(iso: string): number;
export function monthIso(mi: number): string;
export function dateInZone(instant: Date, timeZone: string): string;
export function firstOnOrAfter(dates: string[], iso: string): number;
export function lastOnOrBefore(dates: string[], iso: string): number;
export function monthlyAnchors(dates: string[]): { m0: number; idx: number[] };
export function momentStart(dates: string[], eventIso: string, maxGapDays?: number): number;
export function startStats(x: number[], s: number): { peak: number; trough: number; rec: number; worst: number };
export function cpiLookup(cpi: { m0: number; v: number[] }): (iso: string) => number;
export function bigMoves(dates: string[], closes: number[], up?: number, down?: number): { date: string; move: number }[];
export function buildAsset(args: {
  info: { s: string; n: string; k: string; a?: string[]; pop?: number; philly?: number; ipo?: boolean };
  dates: string[];
  closes: number[];
  cpiAt: (iso: string) => number;
  moments: { id: string; date: string }[];
}): RawAsset | null;
export function encodeDaily(dates: string[], closes: number[]): { b: string; d: number[]; c: number[] };
export function logDeltas(values: (number | null)[]): (number | null)[];
export function fromLogDeltas(deltas: (number | null)[]): (number | null)[];
