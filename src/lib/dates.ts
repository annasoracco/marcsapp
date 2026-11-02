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
export function etMinutes(d: Date): number {
  const parts = Object.fromEntries(etHourFmt.formatToParts(d).map((p) => [p.type, p.value]));
  return Number(parts.hour) * 60 + Number(parts.minute);
}

export function etMinutesFromEpoch(sec: number): number {
  return etMinutes(new Date(sec * 1000));
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

/** 0 = Sunday ... 6 = Saturday */
export function weekday(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

export function isWeekday(iso: string): boolean {
  const d = weekday(iso);
  return d !== 0 && d !== 6;
}

export function nextWeekday(iso: string): string {
  let d = addDays(iso, 1);
  while (!isWeekday(d)) d = addDays(d, 1);
  return d;
}

/** The Monday of the week containing `iso`. */
export function mondayOf(iso: string): string {
  return addDays(iso, -((weekday(iso) + 6) % 7));
}

const utc = (iso: string) => new Date(`${iso}T12:00:00Z`);
const longDay = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "long" });
const shortDay = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" });
const monthDay = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

/** "Thursday" */
export const dayName = (iso: string) => longDay.format(utc(iso));
/** "Thu" */
export const dayShort = (iso: string) => shortDay.format(utc(iso));
/** "Oct 29" */
export const monthDayLabel = (iso: string) => monthDay.format(utc(iso));
/** "Thu, Oct 29" */
export const dayDateLabel = (iso: string) => `${dayShort(iso)}, ${monthDayLabel(iso)}`;

/** "Oct 26–30", "Oct 29–Nov 2", or "Oct 30" for a single day. */
export function rangeLabel(from: string, to: string): string {
  if (from === to) return monthDayLabel(from);
  const end = from.slice(5, 7) === to.slice(5, 7) ? String(Number(to.slice(8))) : monthDayLabel(to);
  return `${monthDayLabel(from)}\u2013${end}`;
}

/** "Oct 26–30", or "Oct 29–Nov 2" across months (Monday through Friday). */
export function weekRange(monday: string): string {
  return rangeLabel(monday, addDays(monday, 4));
}

/** "today's close", "Monday's close", or "Mon, Nov 9 close" depending on distance from today. */
export function closeLabel(iso: string, today: string): string {
  if (iso === today) return "today's close";
  const ahead = daysBetween(today, iso);
  if (ahead === 1) return "tomorrow's close";
  if (ahead > 1 && ahead < 7) return `${dayName(iso)}'s close`;
  return `the ${dayDateLabel(iso)} close`;
}