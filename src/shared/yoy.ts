// Year-over-year comparison of two precomputed YearStats. Pure and cheap: only compares
// ranked lists and scalar habits that the pipeline already computed.
import type { Counted, YearStats } from './stats.ts';

export type RankStatus = 'up' | 'down' | 'same' | 'new' | 'dropped';
export interface RankChange {
  id: string;
  rankA: number | null; // 1-based rank in the earlier year
  rankB: number | null; // 1-based rank in the later year
  countA: number;
  countB: number;
  status: RankStatus;
  moved: number; // positive = climbed
}
export interface RankComparison {
  top: RankChange[]; // later year's top N with movement
  dropped: RankChange[]; // in earlier top N, not in later top N
  stayed: string[]; // in both top N
}
export interface HabitShift {
  id: 'hour' | 'ttc' | 'late' | 'onDay' | 'weekend' | 'reschedules' | 'daily' | 'lastMinute';
  a: number;
  b: number;
  delta: number; // b - a, in the metric's unit
  unit: 'hours' | 'days' | 'share' | 'count' | 'perDay';
}
export interface YoY {
  a: string;
  b: string;
  enough: boolean;
  reason?: string;
  completions: { a: number; b: number; delta: number; pct: number | null };
  projects: RankComparison;
  labels: RankComparison;
  themes: RankComparison;
  shifts: HabitShift[];
}

const MIN_COMPLETIONS = 30;
const MIN_DAYS = 30;

export function compareRanks(a: Counted[], b: Counted[], n = 10): RankComparison {
  const rankA = new Map(a.map((x, i) => [x.id, i + 1]));
  const countA = new Map(a.map((x) => [x.id, x.count]));
  const rankB = new Map(b.map((x, i) => [x.id, i + 1]));
  const top = b.slice(0, n).map((x, i): RankChange => {
    const ra = rankA.get(x.id) ?? null;
    const rb = i + 1;
    const status: RankStatus = ra === null ? 'new' : ra > rb ? 'up' : ra < rb ? 'down' : 'same';
    return { id: x.id, rankA: ra, rankB: rb, countA: countA.get(x.id) ?? 0, countB: x.count, status, moved: ra === null ? 0 : ra - rb };
  });
  const topB = new Set(b.slice(0, n).map((x) => x.id));
  const countB = new Map(b.map((x) => [x.id, x.count]));
  const dropped = a.slice(0, n).filter((x) => !topB.has(x.id)).map((x): RankChange => ({
    id: x.id, rankA: rankA.get(x.id)!, rankB: rankB.get(x.id) ?? null, countA: x.count, countB: countB.get(x.id) ?? 0, status: 'dropped', moved: 0,
  }));
  const stayed = a.slice(0, n).filter((x) => topB.has(x.id)).map((x) => x.id);
  return { top, dropped, stayed };
}

const themeCounted = (y: YearStats): Counted[] => y.themes.share.map((s) => ({ id: s.theme, count: s.count, share: s.share }));

export function compareYears(a: YearStats, b: YearStats): YoY {
  const [early, late] = a.key <= b.key ? [a, b] : [b, a];
  let reason: string | undefined;
  for (const y of [early, late]) {
    if (y.classics.completions < MIN_COMPLETIONS) reason = `${y.label} has only ${y.classics.completions} completions.`;
    else if (y.coverage.daysCovered < MIN_DAYS) reason = `${y.label} only has ${y.coverage.daysCovered} days of data.`;
  }
  const ca = early.classics.completions;
  const cb = late.classics.completions;
  const shift = (id: HabitShift['id'], va: number | null | undefined, vb: number | null | undefined, unit: HabitShift['unit']): HabitShift[] =>
    va == null || vb == null ? [] : [{ id, a: va, b: vb, delta: vb - va, unit }];
  const dueA = early.habits.dueTiming;
  const dueB = late.habits.dueTiming;
  const share = (n: number, d: number) => (d ? n / d : null);
  const weekendShare = (y: YearStats) => share(y.habits.weekdayWeekend.weekend, y.habits.weekdayWeekend.weekend + y.habits.weekdayWeekend.weekday);
  const ttcDays = (y: YearStats) => (y.habits.timeToComplete.medianHours == null ? null : y.habits.timeToComplete.medianHours / 24);
  return {
    a: early.key,
    b: late.key,
    enough: !reason,
    reason,
    completions: { a: ca, b: cb, delta: cb - ca, pct: ca ? (cb - ca) / ca : null },
    projects: compareRanks(early.classics.topProjects, late.classics.topProjects),
    labels: compareRanks(early.classics.topLabels, late.classics.topLabels),
    themes: compareRanks(themeCounted(early), themeCounted(late)),
    shifts: [
      ...shift('hour', early.habits.averageHour, late.habits.averageHour, 'hours'),
      ...shift('ttc', ttcDays(early), ttcDays(late), 'days'),
      ...shift('late', dueA.avgDaysLate, dueB.avgDaysLate, 'days'),
      ...shift('onDay', share(dueA.onDay + dueA.early, dueA.withDue), share(dueB.onDay + dueB.early, dueB.withDue), 'share'),
      ...shift('lastMinute', dueA.lastMinute.rate, dueB.lastMinute.rate, 'share'),
      ...shift('weekend', weekendShare(early), weekendShare(late), 'share'),
      ...shift('reschedules', early.habits.reschedules.total, late.habits.reschedules.total, 'count'),
      ...shift('daily', early.classics.dailyAverage, late.classics.dailyAverage, 'perDay'),
    ],
  };
}

/** Plain-language sentence for a shift, e.g. "You finished tasks 1.5 hrs later in the day." */
export function describeShift(s: HabitShift): string | null {
  const abs = Math.abs(s.delta);
  const r1 = (x: number) => Math.round(x * 10) / 10;
  switch (s.id) {
    case 'hour':
      return abs < 0.25 ? 'You finished tasks at about the same time of day.' : `You finished tasks ${r1(abs)} hrs ${s.delta > 0 ? 'later' : 'earlier'} in the day.`;
    case 'ttc':
      return abs < 0.1 ? 'Time-to-done held steady.' : `Procrastination ${s.delta < 0 ? 'down' : 'up'} ${r1(abs)} days (median time from added to done).`;
    case 'late':
      return abs < 0.1 ? null : `Late tasks were ${r1(abs)} days ${s.delta < 0 ? 'less' : 'more'} late on average.`;
    case 'onDay':
      return abs < 0.01 ? null : `On-time rate ${s.delta > 0 ? 'up' : 'down'} ${Math.round(abs * 100)} points.`;
    case 'lastMinute':
      return abs < 0.01 ? null : `${s.delta > 0 ? 'More' : 'Fewer'} last-minute finishes (${Math.round(abs * 100)} points).`;
    case 'weekend':
      return abs < 0.01 ? null : `${s.delta > 0 ? 'More' : 'Less'} weekend work (${Math.round(abs * 100)} points of your total).`;
    case 'reschedules':
      return s.delta === 0 ? null : `${Math.round(abs).toLocaleString('en-US')} ${s.delta < 0 ? 'fewer' : 'more'} reschedules.`;
    case 'daily':
      return abs < 0.1 ? null : `${r1(abs)} ${s.delta > 0 ? 'more' : 'fewer'} completions per day.`;
  }
}
