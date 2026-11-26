// Aggregation: NormalizedData → per-year + all-time stats, index, and search files.
// Year semantics: completion stats use the completion's NY year; creation stats use the
// task's NY creation year; reschedules use the reschedule event's NY year.
import type {
  Bonus, Classics, Counted, Coverage, Habits, HealthItem, IndexFile, Routines, SearchEntry,
  SearchFile, TaskRef, Themes, YearStats, YearSummary, Entities,
} from '../shared/stats.ts';
import { buildEntities } from './aliases.ts';
import { adherence, chainUnit, describeRule, parseRecurrence } from './recurrence.ts';
import { normalizeTitle, plainText, topWords } from './text.ts';
import { assignThemes, DEFAULT_MILESTONE_KEYWORDS, type ThemeConfig } from './themes.ts';
import {
  addDays, dateFromDayNum, dayNum, daysBetween, daysInYear, dowOfDate, parseTs, toLocal, TZ,
  type LocalParts,
} from './time.ts';
import type { Completion, Event, NormalizedData, Task } from './types.ts';

interface CompX { c: Completion; l: LocalParts; ms: number }
interface CreatedX { t: Task; l: LocalParts; ms: number }
interface Period { key: string; label: string; year: number | null }

const inc = <K>(m: Map<K, number>, k: K, by = 1) => m.set(k, (m.get(k) ?? 0) + by);
const sortedEntries = <K>(m: Map<K, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const grid = () => Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
const LAST_MINUTE_HOURS = 3;

export interface BuildOptions {
  themeConfig: ThemeConfig | null;
  now?: string; // for "account age" and "still open"; defaults to the last event
}

export interface BuildOutput {
  index: IndexFile;
  years: YearStats[];
  search: SearchFile;
}

export function buildAll(data: NormalizedData, opts: BuildOptions): BuildOutput {
  const ctx = new Context(data, opts);
  const periods: Period[] = ctx.years.map((y) => ({ key: String(y), label: String(y), year: y }));
  periods.push({ key: 'all', label: 'All time', year: null });
  const years = periods.map((p) => ctx.computePeriod(p));
  const summaries: YearSummary[] = years
    .filter((y) => y.key !== 'all')
    .sort((a, b) => (a.key < b.key ? 1 : -1))
    .map((y) => ({ key: y.key, label: y.label, completions: y.classics.completions, coverage: y.coverage }));
  const all = years.find((y) => y.key === 'all')!;
  summaries.push({ key: 'all', label: 'All time', completions: all.classics.completions, coverage: all.coverage });
  return {
    index: {
      generatedAt: new Date().toISOString(),
      source: data.source,
      timezone: TZ,
      years: summaries,
      entities: ctx.entities,
      themesConfigured: Boolean(opts.themeConfig),
      health: ctx.globalHealth(),
    },
    years,
    search: ctx.buildSearch(),
  };
}

export class Context {
  readonly comps: CompX[];
  readonly created: CreatedX[];
  readonly taskById: Map<string, Task>;
  readonly entities: Entities;
  readonly themeOf: Map<string, string>;
  readonly years: number[];
  readonly firstDate: string;
  readonly lastDate: string;
  readonly nowDate: string;
  readonly milestoneRe: RegExp | null;
  readonly milestoneKeywords: string[];
  readonly reschedules: { e: Event; l: LocalParts }[];
  readonly eventDates: string[]; // NY date of every event, sorted
  readonly debtByMonth: Map<string, { created: number; finished: number; deleted: number }>;
  readonly inboxDaily: Map<string, number> | null;
  readonly latestYear: number;

  constructor(readonly data: NormalizedData, readonly opts: BuildOptions) {
    this.taskById = new Map(data.tasks.map((t) => [t.id, t]));
    this.comps = data.completions.map((c) => {
      const ms = parseTs(c.ts);
      return { c, l: toLocal(ms), ms };
    });
    this.created = data.tasks.filter((t) => t.createdAt).map((t) => {
      const ms = parseTs(t.createdAt!);
      return { t, l: toLocal(ms), ms };
    });
    this.reschedules = data.events.filter((e) => e.type === 'rescheduled').map((e) => ({ e, l: toLocal(e.ts) }));
    this.eventDates = data.events.map((e) => toLocal(e.ts).date).sort();
    this.firstDate = this.eventDates[0] ?? this.comps[0]?.l.date ?? '1970-01-01';
    this.lastDate = this.eventDates[this.eventDates.length - 1] ?? this.firstDate;
    this.nowDate = opts.now ? toLocal(opts.now).date : this.lastDate;

    const themes = assignThemes(data.projects, opts.themeConfig);
    this.themeOf = themes.themeOf;
    const pc = new Map<string, number>();
    const lc = new Map<string, number>();
    const sc = new Map<string, number>();
    for (const { c } of this.comps) {
      inc(pc, c.projectId);
      for (const l of c.labels) inc(lc, l);
      if (c.sectionId) inc(sc, c.sectionId);
    }
    this.entities = buildEntities(data, themes, pc, lc, sc);

    const ys = new Set<number>();
    for (const x of this.comps) ys.add(x.l.year);
    for (const x of this.created) ys.add(x.l.year);
    this.years = [...ys].sort();
    this.latestYear = this.years[this.years.length - 1] ?? new Date().getUTCFullYear();

    this.milestoneKeywords = (opts.themeConfig?.milestoneKeywords ?? DEFAULT_MILESTONE_KEYWORDS).filter(Boolean);
    this.milestoneRe = this.milestoneKeywords.length
      ? new RegExp(`\\b(${this.milestoneKeywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'i')
      : null;

    this.debtByMonth = this.computeDebt();
    this.inboxDaily = this.computeInbox();
  }

  // ---------- helpers
  ref(text: string, projectId: string): TaskRef {
    const alias = this.entities.projects[projectId]?.alias ?? 'a project';
    const t = plainText(text);
    return { text: t.length > 140 ? `${t.slice(0, 137)}…` : t, safe: `a task in ${alias}`, projectId };
  }
  inPeriod(p: Period, l: LocalParts) {
    return p.year === null || l.year === p.year;
  }
  periodRange(p: Period): [string, string] {
    if (p.year === null) return [this.firstDate, this.lastDate];
    return [`${p.year}-01-01`, `${p.year}-12-31`];
  }
  coverage(p: Period): Coverage {
    const [ps, pe] = this.periodRange(p);
    const inRange = this.eventDates.filter((d) => d >= ps && d <= pe);
    const first = inRange[0] ?? null;
    const last = inRange[inRange.length - 1] ?? null;
    const daysCovered = first && last ? daysBetween(first, last) + 1 : 0;
    const daysInPeriod = p.year === null ? daysCovered : daysInYear(p.year);
    return { firstDate: first, lastDate: last, daysCovered, daysInPeriod, percent: daysInPeriod ? round((100 * daysCovered) / daysInPeriod, 1) : 0 };
  }
  top(m: Map<string, number>, total: number, n = 50): Counted[] {
    return sortedEntries(m).slice(0, n).map(([id, count]) => ({ id, count, share: total ? round(count / total, 4) : 0 }));
  }

  // ---------- global series
  computeDebt() {
    const m = new Map<string, { created: number; finished: number; deleted: number }>();
    const get = (k: string) => m.get(k) ?? (m.set(k, { created: 0, finished: 0, deleted: 0 }), m.get(k)!);
    for (const t of this.data.tasks) {
      if (t.isRecurring || !t.createdAt) continue;
      get(toLocal(t.createdAt).date.slice(0, 7)).created++;
      if (t.completedAt && (t.isCompleted || t.source === 'events-only')) get(toLocal(t.completedAt).date.slice(0, 7)).finished++;
      else if (t.deletedAt) get(toLocal(t.deletedAt).date.slice(0, 7)).deleted++;
    }
    return m;
  }

  /** Approximate end-of-day open-task count in the Inbox. Project membership comes from each
   * event's project; moves before 2026 only show up at the task's next event. */
  computeInbox(): Map<string, number> | null {
    const inbox = this.data.projects.find((p) => p.isInbox)?.id;
    if (!inbox || !this.data.health.hasEventLog) return null;
    const byTask = new Map<string, Event[]>();
    for (const e of this.data.events) {
      if (e.objectType !== 'item') continue;
      let l = byTask.get(e.objectId);
      if (!l) byTask.set(e.objectId, (l = []));
      l.push(e);
    }
    const delta = new Map<string, number>();
    for (const t of this.data.tasks) {
      const evs = byTask.get(t.id) ?? [];
      const close = t.isRecurring
        ? t.isCompleted && t.completedAt ? t.completedAt : t.deletedAt
        : (t.isCompleted || t.source === 'events-only') && t.completedAt ? t.completedAt : t.deletedAt;
      const timeline: { ts: string; pid: string }[] = evs.length
        ? evs.map((e) => ({ ts: e.ts, pid: e.type === 'moved' && e.extra?.toProjectId ? e.extra.toProjectId : e.projectId ?? t.projectId }))
        : t.createdAt ? [{ ts: t.createdAt, pid: t.projectId }] : [];
      // The task record knows where a still-existing task lives now; if its last event disagrees,
      // the move left no trace, so assume it happened right after that last event.
      const lastStep = timeline[timeline.length - 1];
      if (t.source === 'items' && lastStep && lastStep.pid !== t.projectId) timeline.push({ ts: lastStep.ts, pid: t.projectId });
      let enter: string | null = null;
      const closeSeg = (exitTs: string) => {
        if (enter === null) return;
        const a = toLocal(enter).date;
        const b = toLocal(exitTs).date;
        if (a !== b) {
          inc(delta, a, 1);
          inc(delta, b, -1);
        }
        enter = null;
      };
      for (const step of timeline) {
        if (close && step.ts > close) break;
        if (step.pid === inbox && enter === null) enter = step.ts;
        else if (step.pid !== inbox && enter !== null) closeSeg(step.ts);
      }
      if (enter !== null) {
        if (close) closeSeg(close);
        else inc(delta, toLocal(enter).date, 1);
      }
    }
    const daily = new Map<string, number>();
    let run = 0;
    for (let d = dayNum(this.firstDate); d <= dayNum(this.lastDate); d++) {
      const date = dateFromDayNum(d);
      run += delta.get(date) ?? 0;
      daily.set(date, run);
    }
    return daily;
  }

  // ---------- per-period
  computePeriod(p: Period): YearStats {
    const C = this.comps.filter((x) => this.inPeriod(p, x.l));
    const N = this.created.filter((x) => this.inPeriod(p, x.l));
    const coverage = this.coverage(p);
    return {
      key: p.key,
      label: p.label,
      coverage,
      health: this.periodHealth(p, coverage),
      classics: this.classics(p, C, N, coverage),
      habits: this.habits(p, C, N, coverage),
      themes: this.themes(p, C),
      routines: this.routines(p, C, coverage),
      bonus: this.bonus(),
    };
  }

  classics(p: Period, C: CompX[], N: CreatedX[], cov: Coverage): Classics {
    const proj = new Map<string, number>();
    const lab = new Map<string, number>();
    const sec = new Map<string, number>();
    const prio = { p1: 0, p2: 0, p3: 0, p4: 0 };
    const finished = new Set<string>();
    const days = new Map<string, number>();
    let rec = 0;
    let sub = 0;
    for (const { c, l } of C) {
      inc(proj, c.projectId);
      for (const x of c.labels) inc(lab, x);
      if (c.sectionId) inc(sec, c.sectionId);
      prio[`p${c.priority}` as keyof typeof prio]++;
      if (c.isRecurringOccurrence) rec++;
      else finished.add(c.taskId);
      if (c.parentId) sub++;
      inc(days, l.date);
    }
    const total = C.length;
    const completedOfCreated = N.filter((x) => x.t.completedAt).length;
    const comments = this.data.comments.filter((c) => this.inPeriod(p, toLocal(c.postedAt))).length;

    // #1 project deep-dive
    let topProject: Classics['topProject'] = null;
    const topId = sortedEntries(proj)[0]?.[0];
    if (topId) {
      const PC = C.filter((x) => x.c.projectId === topId);
      const months = new Map<string, number>();
      for (const x of PC) inc(months, x.l.date.slice(0, 7));
      const bm = sortedEntries(months)[0];
      const distinctTexts = new Map<string, string>();
      for (const x of PC) distinctTexts.set(x.c.taskId, x.c.content);
      const parents = new Map<string, number>();
      for (const x of PC) if (x.c.parentId) inc(parents, x.c.parentId);
      const bp = sortedEntries(parents)[0];
      const parentTask = bp ? this.taskById.get(bp[0]) : undefined;
      topProject = {
        id: topId,
        count: PC.length,
        share: round(PC.length / total, 4),
        firstTask: PC[0] ? { task: this.ref(PC[0].c.content, topId), ts: PC[0].c.ts } : null,
        busiestMonth: bm ? { month: bm[0], count: bm[1] } : null,
        topWords: topWords(distinctTexts.values(), 12),
        biggestParent: bp && parentTask ? { task: this.ref(parentTask.content, parentTask.projectId), subtasks: bp[1] } : null,
      };
    }

    const bd = sortedEntries(days)[0];
    const busiestDay = bd
      ? { date: bd[0], count: bd[1], tasks: C.filter((x) => x.l.date === bd[0]).slice(0, 60).map((x) => this.ref(x.c.content, x.c.projectId)) }
      : null;

    // streaks over the covered span
    let longestStreak: Classics['longestStreak'] = null;
    let longestDrySpell: Classics['longestDrySpell'] = null;
    if (cov.firstDate && cov.lastDate) {
      let run = 0;
      let dry = 0;
      for (let d = dayNum(cov.firstDate); d <= dayNum(cov.lastDate); d++) {
        const date = dateFromDayNum(d);
        if (days.has(date)) {
          run++;
          dry = 0;
          if (!longestStreak || run > longestStreak.days) longestStreak = { days: run, start: addDays(date, -(run - 1)), end: date };
        } else {
          dry++;
          run = 0;
          if (!longestDrySpell || dry > longestDrySpell.days) longestDrySpell = { days: dry, start: addDays(date, -(dry - 1)), end: date };
        }
      }
    }
    const dailyAverage = cov.daysCovered ? total / cov.daysCovered : 0;
    const isCurrent = p.year === null || p.year === this.latestYear;
    return {
      completions: total,
      tasksFinished: finished.size,
      recurringCompletions: rec,
      created: N.length,
      completionRate: { created: N.length, completed: completedOfCreated, rate: N.length ? round(completedOfCreated / N.length, 4) : 0 },
      subtasksCompleted: sub,
      commentsWritten: comments,
      uniqueProjects: proj.size,
      uniqueLabels: lab.size,
      activeDays: days.size,
      dailyAverage: round(dailyAverage, 2),
      topProjects: this.top(proj, total),
      topLabels: this.top(lab, total),
      topSections: this.top(sec, total),
      priority: prio,
      karma: isCurrent && this.data.account.karma != null ? { current: this.data.account.karma, trend: this.data.account.karmaTrend } : null,
      topProject,
      busiestDay,
      longestStreak,
      longestDrySpell,
      crusher: {
        // Playful, invented scale (not real Todoist data): more completions/day → smaller "top %".
        topPercent: Math.max(1, Math.min(60, Math.round(100 * Math.exp(-dailyAverage / 1.6)))),
        basis: `${round(dailyAverage, 1)} completions per day`,
      },
    };
  }

  habits(p: Period, C: CompX[], N: CreatedX[], cov: Coverage): Habits {
    const [ps, pe] = this.periodRange(p);
    const months = new Map<string, number>();
    const ch = grid();
    const nh = grid();
    const days = new Map<string, number>();
    let weekday = 0;
    let weekend = 0;
    let hourSum = 0;
    let early = 0;
    let night = 0;
    for (const { c, l } of C) {
      void c;
      inc(months, l.date.slice(0, 7));
      ch[l.dow][l.hour]++;
      inc(days, l.date);
      if (l.dow === 0 || l.dow === 6) weekend++;
      else weekday++;
      const h = l.hour + l.minute / 60;
      hourSum += ((h - 4 + 24) % 24) + 4;
      if (l.hour >= 5 && l.hour < 10) early++;
      if (l.hour >= 21 || l.hour < 4) night++;
    }
    for (const { l } of N) nh[l.dow][l.hour]++;

    // month list
    const monthList: string[] = [];
    if (p.year !== null) for (let m = 1; m <= 12; m++) monthList.push(`${p.year}-${String(m).padStart(2, '0')}`);
    else if (cov.firstDate && cov.lastDate) {
      let y = +cov.firstDate.slice(0, 4);
      let m = +cov.firstDate.slice(5, 7);
      const end = cov.lastDate.slice(0, 7);
      for (;;) {
        const k = `${y}-${String(m).padStart(2, '0')}`;
        monthList.push(k);
        if (k >= end) break;
        m++;
        if (m > 12) { m = 1; y++; }
      }
    }
    const calendar: { date: string; count: number }[] = [];
    const calStart = p.year !== null ? ps : cov.firstDate;
    const calEnd = p.year !== null ? pe : cov.lastDate;
    if (calStart && calEnd) for (let d = dayNum(calStart); d <= dayNum(calEnd); d++) {
      const date = dateFromDayNum(d);
      calendar.push({ date, count: days.get(date) ?? 0 });
    }

    // weekday/weekend per-day rates over the covered span
    let wdDays = 0;
    let weDays = 0;
    if (cov.firstDate && cov.lastDate) for (let d = dayNum(cov.firstDate); d <= dayNum(cov.lastDate); d++) {
      const dow = dowOfDate(dateFromDayNum(d));
      if (dow === 0 || dow === 6) weDays++;
      else wdDays++;
    }

    // time to complete (non-recurring tasks finished in period)
    const ttc: { t: Task; hours: number }[] = [];
    for (const t of this.data.tasks) {
      if (t.isRecurring || !t.completedAt || !t.createdAt) continue;
      if (!(t.isCompleted || t.source === 'events-only')) continue;
      if (!this.inPeriod(p, toLocal(t.completedAt))) continue;
      const hours = (parseTs(t.completedAt) - parseTs(t.createdAt)) / 3_600_000;
      if (hours >= 0) ttc.push({ t, hours });
    }
    const bucketDefs: [string, number][] = [['< 1 hour', 1], ['1–24 hours', 24], ['1–7 days', 168], ['1–4 weeks', 672], ['1–6 months', 4380], ['6+ months', Infinity]];
    const buckets = bucketDefs.map(([label]) => ({ label, count: 0 }));
    for (const { hours } of ttc) buckets[bucketDefs.findIndex(([, max]) => hours < max)].count++;
    const byProj = new Map<string, number[]>();
    for (const { t, hours } of ttc) (byProj.get(t.projectId) ?? byProj.set(t.projectId, []).get(t.projectId)!).push(hours);
    const projMedians = [...byProj.entries()].filter(([, xs]) => xs.length >= 15).map(([id, xs]) => ({ id, medianHours: round(median(xs)!, 1), n: xs.length }));
    projMedians.sort((a, b) => a.medianHours - b.medianHours);
    const longest = ttc.reduce<{ t: Task; hours: number } | null>((best, x) => (!best || x.hours > best.hours ? x : best), null);

    // oldest open task (only meaningful for the latest year and all-time)
    let oldestOpen: Habits['oldestOpen'] = null;
    if (p.year === null || p.year === this.latestYear) {
      const open = this.data.tasks.filter((t) => t.source !== 'events-only' && !t.isCompleted && !t.isRecurring && !t.isDeleted && t.createdAt);
      open.sort((a, b) => (a.createdAt! < b.createdAt! ? -1 : 1));
      const o = open[0];
      if (o) oldestOpen = { task: this.ref(o.content, o.projectId), createdAt: o.createdAt!, ageDays: daysBetween(toLocal(o.createdAt!).date, this.nowDate) };
    }

    // due timing
    let withDue = 0, earlyN = 0, onDay = 0, late = 0, lateDays = 0, lastMinute = 0;
    for (const { c, l, ms } of C) {
      const d = c.dueAtCompletion;
      if (!d) continue;
      withDue++;
      if (d.datetime) {
        const dueMs = parseTs(d.datetime);
        if (ms <= dueMs) {
          if (l.date < d.date) earlyN++;
          else onDay++;
          if (dueMs - ms <= LAST_MINUTE_HOURS * 3_600_000) lastMinute++;
        } else {
          late++;
          lateDays += Math.max(0, daysBetween(d.date, l.date));
        }
      } else if (l.date < d.date) earlyN++;
      else if (l.date === d.date) {
        onDay++;
        if (l.hour >= 24 - LAST_MINUTE_HOURS) lastMinute++;
      } else {
        late++;
        lateDays += daysBetween(d.date, l.date);
      }
    }
    const dueTodayDoneToday = withDue ? round(onDay / withDue, 4) : 0;

    // deadlines (by deadline date in period)
    const dl = this.data.tasks.filter((t) => t.deadline && t.deadline >= ps && t.deadline <= pe);
    const deadlines = dl.length
      ? {
          met: dl.filter((t) => t.completedAt && toLocal(t.completedAt).date <= t.deadline!).length,
          missed: dl.filter((t) => t.completedAt && toLocal(t.completedAt).date > t.deadline!).length,
          openPastDeadline: dl.filter((t) => !t.completedAt && !t.isDeleted && t.deadline! < this.nowDate).length,
        }
      : null;

    // reschedules
    const R = this.reschedules.filter((x) => this.inPeriod(p, x.l));
    let later = 0;
    let earlier = 0;
    const perTask = new Map<string, number>();
    for (const { e } of R) {
      inc(perTask, e.objectId);
      const from = e.extra?.dueFrom;
      const to = e.extra?.dueTo;
      if (from && to) {
        const a = from.datetime ?? from.date;
        const b = to.datetime ?? to.date;
        if (b > a) later++;
        else if (b < a) earlier++;
      }
    }
    const mostRescheduled = sortedEntries(perTask).slice(0, 10).map(([id, count]) => {
      const t = this.taskById.get(id);
      return { task: this.ref(t?.content ?? '', t?.projectId ?? ''), count };
    });

    // task debt (cumulative over all history, sliced to the period)
    const debtMonths = [...this.debtByMonth.keys()].sort();
    let cum = 0;
    const debtAll = debtMonths.map((m) => {
      const v = this.debtByMonth.get(m)!;
      cum += v.created - v.finished - v.deleted;
      return { month: m, ...v, cumulative: cum };
    });
    const taskDebt = debtAll.filter((d) => p.year === null || d.month.startsWith(String(p.year)));

    // inbox zero
    let inboxZero: Habits['inboxZero'] = null;
    if (this.inboxDaily && cov.firstDate && cov.lastDate) {
      let zeroDays = 0, run = 0, best = 0;
      for (let d = dayNum(cov.firstDate); d <= dayNum(cov.lastDate); d++) {
        const v = this.inboxDaily.get(dateFromDayNum(d));
        if (v !== undefined && v <= 0) {
          zeroDays++;
          run++;
          best = Math.max(best, run);
        } else run = 0;
      }
      inboxZero = { days: zeroDays, longestRun: best, approximate: true };
    }

    // same-day capture-and-finish, planning burst, Sunday planner (creation-year semantics)
    const nonRecCreated = N.filter((x) => !x.t.isRecurring);
    const sameDayN = nonRecCreated.filter((x) => x.t.completedAt && toLocal(x.t.completedAt).date === x.l.date).length;
    const hours = new Map<string, number>();
    for (const { l } of N) inc(hours, `${l.date}|${l.hour}`);
    const burst = sortedEntries(hours)[0];
    const sundayN = N.filter((x) => x.l.dow === 0).length;
    const sundayShare = N.length ? sundayN / N.length : 0;

    // persona
    const sprintScore = withDue ? (lastMinute + late * 0.5) / withDue : 0;
    const scores = { 'early-bird': C.length ? early / C.length : 0, 'night-owl': C.length ? night / C.length : 0, 'deadline-sprinter': sprintScore };
    const baselines = { 'early-bird': 0.15, 'night-owl': 0.15, 'deadline-sprinter': 0.25 };
    const ratios = (Object.keys(scores) as (keyof typeof scores)[]).map((k) => [k, scores[k] / baselines[k]] as const).sort((a, b) => b[1] - a[1]);
    const pid = ratios[0] && ratios[0][1] >= 1.2 ? ratios[0][0] : 'steady';
    const PERSONAS = {
      'early-bird': ['The Early Bird', 'You clear the decks before most people finish their coffee.'],
      'night-owl': ['The Night Owl', 'Your best work happens after the sun clocks out.'],
      'deadline-sprinter': ['The Deadline Sprinter', 'Pressure is your fuel. You love a photo finish.'],
      steady: ['The Steady Engine', 'No drama, no all-nighters. You just keep shipping, all day long.'],
    } as const;

    return {
      byMonth: monthList.map((m) => ({ month: m, count: months.get(m) ?? 0 })),
      completionHeatmap: ch,
      creationHeatmap: nh,
      calendar,
      persona: { id: pid, title: PERSONAS[pid][0], blurb: PERSONAS[pid][1], scores: Object.fromEntries(Object.entries(scores).map(([k, v]) => [k, round(v, 3)])) },
      weekdayWeekend: { weekday, weekend, weekdayPerDay: wdDays ? round(weekday / wdDays, 2) : 0, weekendPerDay: weDays ? round(weekend / weDays, 2) : 0 },
      averageHour: C.length ? round(hourSum / C.length, 2) : null,
      timeToComplete: {
        count: ttc.length,
        medianHours: ttc.length ? round(median(ttc.map((x) => x.hours))!, 1) : null,
        buckets,
        fastestProject: projMedians[0] ?? null,
        slowestProject: projMedians.length > 1 ? projMedians[projMedians.length - 1] : null,
        longestLingering: longest
          ? { task: this.ref(longest.t.content, longest.t.projectId), days: Math.round(longest.hours / 24), createdAt: longest.t.createdAt!, completedAt: longest.t.completedAt! }
          : null,
      },
      oldestOpen,
      dueTiming: {
        withDue, early: earlyN, onDay, late, noDue: C.length - withDue,
        avgDaysLate: late ? round(lateDays / late, 1) : null,
        dueTodayDoneToday,
        lastMinute: { count: lastMinute, rate: withDue ? round(lastMinute / withDue, 4) : 0 },
      },
      deadlines,
      reschedules: { total: R.length, pushedLater: later, pulledEarlier: earlier, tasksRescheduled: perTask.size, mostRescheduled },
      taskDebt,
      inboxZero,
      sameDay: { count: sameDayN, of: nonRecCreated.length, rate: nonRecCreated.length ? round(sameDayN / nonRecCreated.length, 4) : 0 },
      planningBurst: burst ? { date: burst[0].split('|')[0], hour: +burst[0].split('|')[1], count: burst[1] } : null,
      sundayPlanner: { sundayShare: round(sundayShare, 4), baseline: round(1 / 7, 4), score: round(sundayShare * 7, 2) },
    };
  }

  themes(p: Period, C: CompX[]): Themes {
    const total = C.length;
    const byTheme = new Map<string, number>();
    for (const { c } of C) inc(byTheme, this.themeOf.get(c.projectId) ?? 'Other');
    const share = sortedEntries(byTheme).map(([theme, count]) => ({ theme, count, share: total ? round(count / total, 4) : 0 }));
    const topThemes = new Set(share.slice(0, 8).map((s) => s.theme));

    const monthTheme = new Map<string, Map<string, number>>();
    const monthProj = new Map<string, Map<string, number>>();
    for (const { c, l } of C) {
      const m = l.date.slice(0, 7);
      const th = this.themeOf.get(c.projectId) ?? 'Other';
      if (!monthTheme.has(m)) monthTheme.set(m, new Map());
      if (!monthProj.has(m)) monthProj.set(m, new Map());
      inc(monthTheme.get(m)!, topThemes.has(th) ? th : 'Other');
      inc(monthProj.get(m)!, c.projectId);
    }
    const months = [...monthTheme.keys()].sort();
    const byMonth = months.map((m) => ({ month: m, counts: Object.fromEntries(monthTheme.get(m)!) }));
    const seasons = months.map((m) => {
      const realTheme = new Map<string, number>();
      for (const [pid, n] of monthProj.get(m)!) inc(realTheme, this.themeOf.get(pid) ?? 'Other', n);
      const tp = sortedEntries(monthProj.get(m)!)[0];
      return { month: m, topProject: tp?.[0] ?? null, topTheme: sortedEntries(realTheme)[0]?.[0] ?? null, count: [...monthProj.get(m)!.values()].reduce((a, b) => a + b, 0) };
    });

    const proj = new Map<string, number>();
    const lastDay = new Map<string, string>();
    for (const { c, l } of C) {
      inc(proj, c.projectId);
      lastDay.set(c.projectId, l.date);
    }
    const top10 = sortedEntries(proj).slice(0, 10).map(([id]) => id);
    const firstYear = +this.firstDate.slice(0, 4);
    const newProjectsInTop10 = p.year === null || p.year === firstYear ? [] : top10.filter((id) => {
      const fa = this.data.projects.find((x) => x.id === id)?.firstActivityAt;
      return fa && toLocal(fa).year === p.year;
    });
    const cov = this.coverage(p);
    const wentQuiet = cov.lastDate
      ? sortedEntries(proj)
          .filter(([id, n]) => n >= 10 && daysBetween(lastDay.get(id)!, cov.lastDate!) >= 60)
          .slice(0, 10)
          .map(([id, count]) => ({ id, lastActiveMonth: lastDay.get(id)!.slice(0, 7), count }))
      : [];

    const distinct = new Map<string, CompX>();
    for (const x of C) distinct.set(x.c.taskId, x);
    const keywords = topWords([...distinct.values()].map((x) => x.c.content), 80);
    const keywordsByTheme: Record<string, { word: string; count: number }[]> = {};
    for (const th of [...topThemes].filter((t) => t !== 'Other')) {
      keywordsByTheme[th] = topWords([...distinct.values()].filter((x) => this.themeOf.get(x.c.projectId) === th).map((x) => x.c.content), 10);
    }

    const combos = new Map<string, number>();
    for (const { c } of C) if (c.labels.length >= 2) inc(combos, [...c.labels].sort().join('\u0001'));
    const labelCombos = sortedEntries(combos).slice(0, 10).map(([k, count]) => ({ labels: k.split('\u0001'), count }));

    const milestones: Themes['milestones'] = [];
    if (this.milestoneRe) {
      const seen = new Set<string>();
      for (const x of C) {
        if (seen.has(x.c.taskId)) continue;
        const m = this.milestoneRe.exec(x.c.content);
        if (!m) continue;
        seen.add(x.c.taskId);
        milestones.push({ task: this.ref(x.c.content, x.c.projectId), ts: x.c.ts, keyword: m[1].toLowerCase() });
      }
    }
    return { share, byMonth, seasons, newProjectsInTop10, wentQuiet, keywords, keywordsByTheme, labelCombos, milestones: milestones.slice(-120) };
  }

  routines(p: Period, C: CompX[], cov: Coverage): Routines {
    const recC = C.filter((x) => x.c.isRecurringOccurrence);
    const perTask = new Map<string, CompX[]>();
    for (const x of recC) (perTask.get(x.c.taskId) ?? perTask.set(x.c.taskId, []).get(x.c.taskId)!).push(x);
    const ranked = [...perTask.entries()].sort((a, b) => b[1].length - a[1].length);
    const latestText = (xs: CompX[]) => xs[xs.length - 1].c;
    const mostCompleted = ranked.slice(0, 10).map(([id, xs]) => ({ taskId: id, task: this.ref(latestText(xs).content, latestText(xs).projectId), count: xs.length }));

    const [ps, pe] = this.periodRange(p);
    const adh: Routines['adherence'] = [];
    let unparsed = 0;
    for (const [id, xs] of ranked) {
      const t = this.taskById.get(id);
      const rule = parseRecurrence(t?.due?.recurrenceString);
      if (!t || !rule) {
        unparsed++;
        continue;
      }
      if (xs.length < 3) continue;
      const created = t.createdAt ? toLocal(t.createdAt).date : xs[0].l.date;
      const start = created > ps ? created : ps;
      const ends = [pe, cov.lastDate ?? pe, this.nowDate];
      if (t.isCompleted && t.completedAt) ends.push(toLocal(t.completedAt).date);
      if (t.deletedAt) ends.push(toLocal(t.deletedAt).date);
      const end = ends.sort()[0];
      if (end < start) continue;
      const occ = xs.map((x) => x.c.dueAtCompletion?.date ?? x.l.date);
      const a = adherence(rule, occ, start, end);
      if (!a.expected) continue;
      adh.push({
        taskId: id, task: this.ref(t.content, t.projectId), rule: describeRule(rule), expected: a.expected,
        completed: a.completed, rate: round(Math.min(1, a.rate), 4), longestChain: a.longestChain, chainUnit: chainUnit(rule),
      });
    }

    const died: Routines['died'] = [];
    if (cov.lastDate) for (const [id, xs] of ranked) {
      if (xs.length < 5) continue;
      const last = xs[xs.length - 1].l.date;
      if (daysBetween(last, cov.lastDate) >= (p.year === null ? 60 : 45)) {
        died.push({ taskId: id, task: this.ref(latestText(xs).content, latestText(xs).projectId), lastCompleted: last, completions: xs.length });
      }
    }

    const titles = new Map<string, { count: number; variants: Map<string, number>; projectId: string }>();
    for (const t of this.data.tasks) {
      if (t.isRecurring || !t.createdAt || !this.inPeriod(p, toLocal(t.createdAt))) continue;
      const k = normalizeTitle(t.content);
      if (k.length < 3) continue;
      const e = titles.get(k) ?? { count: 0, variants: new Map(), projectId: t.projectId };
      e.count++;
      inc(e.variants, t.content);
      titles.set(k, e);
    }
    const repeatedTitles = [...titles.values()].filter((e) => e.count >= 3).sort((a, b) => b.count - a.count).slice(0, 15)
      .map((e) => ({ task: this.ref(sortedEntries(e.variants)[0][0], e.projectId), count: e.count }));

    return {
      recurringTasks: perTask.size,
      recurringCompletions: recC.length,
      mostCompleted,
      adherence: adh.sort((a, b) => b.completed - a.completed).slice(0, 20),
      unparsedRecurring: unparsed,
      died: died.sort((a, b) => b.completions - a.completions).slice(0, 10),
      repeatedTitles,
    };
  }

  bonus(): Bonus {
    const a = this.data.account;
    const joined = a.joinedAt ?? null;
    const ps = this.data.projects;
    return {
      joinedAt: joined,
      accountAgeDays: joined ? daysBetween(toLocal(joined).date, this.nowDate) : null,
      totals: {
        activeProjects: ps.filter((p) => !p.isArchived && !p.isDeleted).length,
        archivedProjects: ps.filter((p) => p.isArchived).length,
        deletedProjects: ps.filter((p) => p.isDeleted).length,
        labels: a.counts.labels,
        filters: a.counts.filters,
        reminders: a.counts.reminders,
        attachments: a.counts.attachments,
        comments: this.data.comments.length,
      },
      shared: {
        sharedProjects: ps.filter((p) => p.isShared).length,
        assignedToOthers: this.data.tasks.filter((t) => t.assigneeId && t.assigneeId !== a.userId).length,
        assignedByOthers: 0,
        collaborators: this.data.health.collaboratorCount,
      },
    };
  }

  // ---------- data health
  globalHealth(): HealthItem[] {
    const h = this.data.health;
    const items: HealthItem[] = [];
    items.push(h.hasEventLog
      ? { group: 'Completion history', status: 'ok', message: `Full event log from ${h.eventLogRange?.first.slice(0, 10)} to ${h.eventLogRange?.last.slice(0, 10)}. Every completion is timestamped, recurring occurrences included.` }
      : { group: 'Completion history', status: 'partial', message: 'No event log in export → only final completion times; recurring adherence and reschedule counts disabled.' });
    if (h.eventOnlyTasks) items.push({ group: 'Deleted & archived', status: 'ok', message: `${h.eventOnlyTasks.toLocaleString('en-US')} tasks and ${h.eventOnlyProjects} projects exist only in the event log (deleted tasks, archived or deleted projects). They're rebuilt from events and included.` });
    if (h.completionTimeMismatches) items.push({ group: 'Completion times', status: 'ok', message: `${h.completionTimeMismatches} tasks had a different completion time in the task record than in the event log (usually uncomplete → re-complete). The event log was used.` });
    items.push({ group: 'Durations', status: h.durationEvents >= 50 ? 'ok' : 'unavailable', message: h.durationEvents >= 50 ? 'Task durations available.' : `Only ${h.durationEvents} task events ever carried a duration, so the count-vs-duration toggle is off.` });
    if (!h.hasKarmaHistory) items.push({ group: 'Karma', status: 'partial', message: 'The export has your current karma and trend only, no karma history over time.' });
    if (h.sectionsTotal) items.push({ group: 'Section names', status: h.sectionsNamed === h.sectionsTotal ? 'ok' : 'partial', message: `The export has no sections file; ${h.sectionsNamed} of ${h.sectionsTotal} sections are named via events. Others show as "<project> · section N".` });
    if (!h.collaboratorCount) items.push({ group: 'Sharing', status: 'unavailable', message: 'No collaborators or assignments by others in this export (solo account), so shared-project stats are skipped.' });
    const recTotal = this.data.tasks.filter((t) => t.isRecurring).length;
    const recParsed = this.data.tasks.filter((t) => t.isRecurring && parseRecurrence(t.due?.recurrenceString)).length;
    items.push({ group: 'Routine adherence', status: 'partial', message: `Recurrence rules survive only on recurring tasks that still exist: ${recParsed} of ${recTotal} recurring tasks have a rule we can read. Others show completion counts, but no adherence or chains.` });
    if (this.inboxDaily) items.push({ group: 'Inbox zero', status: 'partial', message: 'Reconstructed from events. Moves between projects before 2026 only appear at the task\'s next event, so this is approximate.' });
    if (!this.opts.themeConfig) items.push({ group: 'Themes', status: 'partial', message: 'No config/themes.local.json found, so each project is its own theme. Run `npm run init:themes` and fill it in.' });
    items.push({ group: 'Projects', status: 'ok', message: 'The export has no project hierarchy, so themes come from your config.' });
    for (const n of h.notes) if (!/completion time/.test(n)) items.push({ group: 'Note', status: 'ok', message: n });
    return items;
  }

  periodHealth(p: Period, cov: Coverage): HealthItem[] {
    const out: HealthItem[] = [];
    if (p.year !== null && cov.percent < 99.5 && cov.firstDate) {
      out.push({ group: 'Coverage', status: 'partial', message: `Data covers ${cov.firstDate} to ${cov.lastDate} (${cov.percent}% of ${p.year}).` });
    }
    if (!this.data.tasks.some((t) => t.deadline && (p.year === null || t.deadline.startsWith(String(p.year))))) {
      out.push({ group: 'Deadlines', status: 'unavailable', message: 'No tasks with a deadline in this period.' });
    }
    return out;
  }

  // ---------- search index
  buildSearch(): SearchFile {
    const entries: SearchEntry[] = [];
    const agg = (key: string, kind: SearchEntry['kind'], text: string, projectId?: string) => {
      const e: SearchEntry = { id: key, kind, text, projectId, total: 0, first: null, last: null, monthly: {} };
      return e;
    };
    const proj = new Map<string, SearchEntry>();
    const lab = new Map<string, SearchEntry>();
    const task = new Map<string, SearchEntry>();
    const touch = (e: SearchEntry, date: string, count: boolean) => {
      if (count) {
        e.total++;
        const m = date.slice(0, 7);
        e.monthly[m] = (e.monthly[m] ?? 0) + 1;
      }
      if (!e.first || date < e.first) e.first = date;
      if (!e.last || date > e.last) e.last = date;
    };
    for (const p of this.data.projects) proj.set(p.id, agg(p.id, 'project', p.id));
    for (const l of this.data.labels) lab.set(l.name, agg(l.name, 'label', l.name));
    for (const t of this.data.tasks) {
      const e = agg(t.id, 'task', plainText(t.content).slice(0, 200), t.projectId);
      if (t.createdAt) touch(e, toLocal(t.createdAt).date, false);
      task.set(t.id, e);
    }
    for (const { c, l } of this.comps) {
      touch(proj.get(c.projectId)!, l.date, true);
      for (const x of c.labels) if (lab.has(x)) touch(lab.get(x)!, l.date, true);
      const te = task.get(c.taskId);
      if (te) touch(te, l.date, true);
    }
    for (const t of this.created) touch(proj.get(t.t.projectId)!, t.l.date, false);
    entries.push(...proj.values(), ...lab.values(), ...[...task.values()].filter((e) => e.text));
    return { entries };
  }
}
