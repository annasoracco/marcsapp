// Date helpers. Market dates are US/Eastern calendar dates in YYYY-MM-DD form.

const ET = "America/New_York";

const etDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: ET,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const etHourFmt = new Intl.DateTimeFormat("en-US", {
  timeZone: ET,
  hour: "numeric",
  minute: "numeric",
  hourCycle: "h23",
});

export function etDate(d: Date): string {
  return etDateFmt.format(d);
}

export function todayET(now: Date = new Date()): string {
  return etDate(now);
}

export function etDateFromEpoch(sec: number): string {
  return etDate(new Date(sec * 1000));
}

/** Minutes after midnight, Eastern time. */
export function etMinutesFromEpoch(sec: number): number {
  const parts = Object.fromEntries(etHourFmt.formatToParts(new Date(sec * 1000)).map((p) => [p.type, p.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
}

export function addDays(iso: string, days: number): string {
  const t = Date.parse(`${iso}T12:00:00Z`) + days * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`)) / 86400000);
}

export function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`));
}
