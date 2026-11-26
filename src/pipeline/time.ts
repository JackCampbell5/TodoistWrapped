// Timezone helpers. Every time-of-day and day-boundary stat uses America/New_York.
// Date-only values (YYYY-MM-DD) are plain local dates and are never shifted.

export const TZ = 'America/New_York';
const DAY_MS = 86_400_000;

export interface LocalParts {
  date: string; // YYYY-MM-DD in NY
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  dow: number; // 0 = Sunday
}

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Parse an ISO timestamp (tolerates microsecond precision) to epoch ms. */
export function parseTs(ts: string): number {
  // V8 handles >3 fractional digits inconsistently across versions; trim to ms.
  const ms = Date.parse(ts.replace(/(\.\d{3})\d+/, '$1'));
  if (Number.isNaN(ms)) throw new Error(`Unparseable timestamp: ${ts}`);
  return ms;
}

/** Normalize any ISO timestamp to a canonical `YYYY-MM-DDTHH:MM:SS.sssZ`. */
export function isoUtc(ts: string | number): string {
  return new Date(typeof ts === 'number' ? ts : parseTs(ts)).toISOString();
}

const localCache = new Map<number, LocalParts>();
export function toLocal(ts: string | number): LocalParts {
  const ms = typeof ts === 'number' ? ts : parseTs(ts);
  const minuteKey = Math.floor(ms / 60_000);
  const hit = localCache.get(minuteKey);
  if (hit) return hit;
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(minuteKey * 60_000))) p[part.type] = part.value;
  const res: LocalParts = {
    date: `${p.year}-${p.month}-${p.day}`,
    year: +p.year,
    month: +p.month,
    day: +p.day,
    hour: +p.hour,
    minute: +p.minute,
    dow: DOW[p.weekday],
  };
  if (localCache.size > 500_000) localCache.clear();
  localCache.set(minuteKey, res);
  return res;
}

export const localDate = (ts: string | number) => toLocal(ts).date;

/** Convert a NY wall-clock time ("YYYY-MM-DDTHH:MM[:SS]") to UTC ISO. Handles DST. */
export function nyWallToUtc(wall: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(wall);
  if (!m) throw new Error(`Bad wall time: ${wall}`);
  const [y, mo, d, h, mi, s] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0)];
  const target = Date.UTC(y, mo - 1, d, h, mi, s);
  let guess = target + 5 * 3_600_000; // NY is UTC-5/-4
  for (let i = 0; i < 3; i++) {
    const lp = toLocal(guess);
    const asUtc = Date.UTC(lp.year, lp.month - 1, lp.day, lp.hour, lp.minute, s);
    guess += target - asUtc;
  }
  return new Date(guess).toISOString();
}

/** Day number for a YYYY-MM-DD local date (days since epoch, timezone-free). */
export function dayNum(date: string): number {
  return Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / DAY_MS;
}
export function dateFromDayNum(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}
export function dowOfDate(date: string): number {
  return new Date(dayNum(date) * DAY_MS).getUTCDay();
}
export function addDays(date: string, n: number): string {
  return dateFromDayNum(dayNum(date) + n);
}
export function daysBetween(a: string, b: string): number {
  return dayNum(b) - dayNum(a);
}
export function daysInYear(year: number): number {
  return (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY_MS;
}

export interface DecodedDue {
  date: string; // local YYYY-MM-DD
  datetime?: string; // UTC ISO, only for timed dues
}

/**
 * Decode a due/deadline value as stored in the activity log.
 * All-day dues are stored as end-of-day in the user's zone at the time, expressed in UTC
 * (e.g. 2026-11-18T04:59:59Z = 2026-11-17 23:59:59 EST). We recover the plain local date
 * without shifting it into NY: an end-of-day instant minus 12h is always on the intended date
 * for any zone between UTC-12 and UTC+11.
 */
export function decodeEventDue(value: string | null | undefined, hasTime?: boolean): DecodedDue | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { date: value };
  const ms = parseTs(value);
  const isEndOfDay = /T\d{2}:59:59/.test(value);
  if (hasTime === false || (hasTime === undefined && isEndOfDay)) {
    return { date: new Date(ms - 12 * 3_600_000).toISOString().slice(0, 10) };
  }
  return { date: localDate(ms), datetime: new Date(ms).toISOString() };
}

/** Decode an item's `due.date` (date-only, floating NY wall time, or UTC). */
export function decodeItemDue(date: string): DecodedDue {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return { date };
  if (/Z$|[+-]\d{2}:\d{2}$/.test(date)) {
    const ms = parseTs(date);
    return { date: localDate(ms), datetime: new Date(ms).toISOString() };
  }
  const utc = nyWallToUtc(date);
  return { date: date.slice(0, 10), datetime: utc };
}

/** Deadlines are dates; the export stores them as midnight UTC. Keep the calendar date. */
export function decodeDeadline(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return value.slice(0, 10);
}

export function monthKey(date: string): string {
  return date.slice(0, 7);
}
