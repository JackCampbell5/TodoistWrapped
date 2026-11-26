// Parse common Todoist recurrence strings into slot rules for adherence and chains.
// Anything we can't parse confidently returns null (reported in data-health, never guessed).
import { dayNum, dowOfDate } from './time.ts';

export type Rule =
  | { kind: 'daily'; interval: number }
  | { kind: 'weekdays' }
  | { kind: 'weekly'; interval: number; days?: number[] }
  | { kind: 'monthly'; interval: number }
  | { kind: 'yearly' };

const DAYS: [RegExp, number][] = [
  [/^sun(day)?s?$/, 0], [/^mon(day)?s?$/, 1], [/^tue?s?(day)?s?$/, 2], [/^wed(nesday)?s?$/, 3],
  [/^thu(r|rs)?(sday)?s?$/, 4], [/^fri(day)?s?$/, 5], [/^sat(urday)?s?$/, 6],
];
const dayToken = (w: string) => DAYS.find(([re]) => re.test(w))?.[1];

export function parseRecurrence(input: string | undefined): Rule | null {
  if (!input) return null;
  let s = input.toLowerCase().trim();
  s = s.replace(/^every!/, 'every').replace(/^each /, 'every ');
  s = s.replace(/\s+(at|@)\s+.*$/, '').replace(/\s+(starting|from|ending|until|for)\b.*$/, '').trim();
  s = s.replace(/\s+/g, ' ');
  if (/^(every )?(day|daily)$/.test(s)) return { kind: 'daily', interval: 1 };
  if (s === 'every other day') return { kind: 'daily', interval: 2 };
  let m = /^every (\d+) days?$/.exec(s);
  if (m) return { kind: 'daily', interval: Math.max(1, +m[1]) };
  if (/^every (week|work)days?$/.test(s)) return { kind: 'weekdays' };
  if (s === 'every weekend') return { kind: 'weekly', interval: 1, days: [0, 6] };
  if (/^(every week|weekly)$/.test(s)) return { kind: 'weekly', interval: 1 };
  if (s === 'every other week') return { kind: 'weekly', interval: 2 };
  m = /^every (\d+) weeks?$/.exec(s);
  if (m) return { kind: 'weekly', interval: Math.max(1, +m[1]) };
  if (/^(every month|monthly)$/.test(s) || /^every (\d+)(st|nd|rd|th)( day)?$/.test(s) || /^every (last|first) (day|work ?day)( of the month)?$/.test(s)) {
    return { kind: 'monthly', interval: 1 };
  }
  if (s === 'every other month') return { kind: 'monthly', interval: 2 };
  m = /^every (\d+) months?$/.exec(s);
  if (m) return { kind: 'monthly', interval: Math.max(1, +m[1]) };
  if (/^(every year|yearly|annually)$/.test(s)) return { kind: 'yearly' };
  // day lists: "every mon, wed and fri", "every other tuesday"
  m = /^every (other )?(.+)$/.exec(s);
  if (m) {
    const words = m[2].split(/[\s,]+|\band\b/).map((w) => w.trim()).filter(Boolean).filter((w) => w !== 'and');
    const days = words.map(dayToken);
    if (days.length && days.every((d) => d !== undefined)) {
      return { kind: 'weekly', interval: m[1] ? 2 : 1, days: [...new Set(days as number[])].sort() };
    }
  }
  return null;
}

/** Slot index for a local date, relative to an anchor date. Same index = same expected occurrence. */
export function slotOf(rule: Rule, date: string, anchor: string): number | null {
  const d = dayNum(date);
  const a = dayNum(anchor);
  switch (rule.kind) {
    case 'daily':
      return Math.floor((d - a) / rule.interval);
    case 'weekdays': {
      // map weekend dates back to the previous Friday's slot
      const dow = dowOfDate(date);
      const back = dow === 0 ? 2 : dow === 6 ? 1 : 0;
      return d - back; // unique per weekday
    }
    case 'weekly': {
      if (!rule.days) return Math.floor((d - a) / (7 * rule.interval));
      // slot = most recent matching weekday on or before date
      for (let k = 0; k < 7; k++) {
        if (rule.days.includes(dowOfDate(dateFromNum(d - k)))) {
          const sd = d - k;
          return rule.interval > 1 ? Math.floor((sd - a) / (7 * rule.interval)) : sd;
        }
      }
      return null;
    }
    case 'monthly': {
      const months = (+date.slice(0, 4) * 12 + +date.slice(5, 7)) - (+anchor.slice(0, 4) * 12 + +anchor.slice(5, 7));
      return Math.floor(months / rule.interval);
    }
    case 'yearly':
      return +date.slice(0, 4);
  }
}

function dateFromNum(n: number): string {
  return new Date(n * 86_400_000).toISOString().slice(0, 10);
}

/** Ordered list of distinct expected slots between start and end (inclusive). */
export function expectedSlots(rule: Rule, start: string, end: string): number[] {
  const out: number[] = [];
  const s = dayNum(start);
  const e = dayNum(end);
  let last: number | null = null;
  for (let d = s; d <= e; d++) {
    const date = dateFromNum(d);
    if (rule.kind === 'weekdays') {
      const dow = dowOfDate(date);
      if (dow === 0 || dow === 6) continue;
    }
    if (rule.kind === 'weekly' && rule.days && rule.interval === 1 && !rule.days.includes(dowOfDate(date))) continue;
    const slot = slotOf(rule, date, start);
    if (slot === null || slot === last) continue;
    out.push(slot);
    last = slot;
  }
  return out;
}

export interface Adherence {
  expected: number;
  completed: number;
  rate: number;
  longestChain: number;
}

/** Adherence and longest unbroken chain for a set of occurrence dates (local YYYY-MM-DD). */
export function adherence(rule: Rule, occurrenceDates: string[], start: string, end: string): Adherence {
  const slots = expectedSlots(rule, start, end);
  const done = new Set<number>();
  for (const d of occurrenceDates) {
    if (d < start || d > end) continue;
    const s = slotOf(rule, d, start);
    if (s !== null) done.add(s);
  }
  let completed = 0;
  let run = 0;
  let best = 0;
  for (const s of slots) {
    if (done.has(s)) {
      completed++;
      run++;
      best = Math.max(best, run);
    } else run = 0;
  }
  return { expected: slots.length, completed, rate: slots.length ? completed / slots.length : 0, longestChain: best };
}

export function describeRule(rule: Rule): string {
  switch (rule.kind) {
    case 'daily':
      return rule.interval === 1 ? 'daily' : `every ${rule.interval} days`;
    case 'weekdays':
      return 'weekdays';
    case 'weekly':
      return rule.days ? `${rule.interval > 1 ? 'every other ' : ''}${rule.days.map((d) => 'Sun Mon Tue Wed Thu Fri Sat'.split(' ')[d]).join('/')}` : rule.interval === 1 ? 'weekly' : `every ${rule.interval} weeks`;
    case 'monthly':
      return rule.interval === 1 ? 'monthly' : `every ${rule.interval} months`;
    case 'yearly':
      return 'yearly';
  }
}

export function chainUnit(rule: Rule): string {
  switch (rule.kind) {
    case 'daily':
      return rule.interval === 1 ? 'days' : 'occurrences';
    case 'weekdays':
      return 'weekdays';
    case 'weekly':
      return rule.days && rule.interval === 1 ? 'occurrences' : 'weeks';
    case 'monthly':
      return 'months';
    case 'yearly':
      return 'years';
  }
}
