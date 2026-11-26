import { beforeAll, describe, expect, it } from 'vitest';
import { ExportAdapter } from '../src/pipeline/adapters/exportAdapter.ts';
import { buildAll, type BuildOutput } from '../src/pipeline/aggregate.ts';
import { loadThemeConfig } from '../src/pipeline/themes.ts';
import type { NormalizedData } from '../src/pipeline/types.ts';
import type { TaskRef, YearStats } from '../src/shared/stats.ts';

let data: NormalizedData;
let out: BuildOutput;
let y2025: YearStats;
let all: YearStats;

beforeAll(async () => {
  data = await new ExportAdapter('fixtures/export').load();
  out = buildAll(data, { themeConfig: loadThemeConfig('fixtures/themes.fixture.json') });
  y2025 = out.years.find((y) => y.key === '2025')!;
  all = out.years.find((y) => y.key === 'all')!;
}, 60_000);

function collectRefs(o: unknown, acc: TaskRef[] = []): TaskRef[] {
  if (Array.isArray(o)) o.forEach((x) => collectRefs(x, acc));
  else if (o && typeof o === 'object') {
    if ('text' in o && 'safe' in o && 'projectId' in o) acc.push(o as TaskRef);
    Object.values(o).forEach((x) => collectRefs(x, acc));
  }
  return acc;
}

describe('periods and coverage', () => {
  it('builds one file per year plus all-time, newest first', () => {
    expect(out.index.years.map((y) => y.key)).toEqual(['2026', '2025', '2024', 'all']);
  });
  it('year completions add up to all-time', () => {
    const sum = out.years.filter((y) => y.key !== 'all').reduce((s, y) => s + y.classics.completions, 0);
    expect(sum).toBe(all.classics.completions);
    expect(all.classics.completions).toBe(data.completions.length);
  });
  it('reports partial coverage for the first year', () => {
    const y2024 = out.years.find((y) => y.key === '2024')!;
    expect(y2024.coverage.firstDate).toBe('2024-03-10');
    expect(y2024.coverage.percent).toBeLessThan(100);
    expect(y2024.health.some((h) => h.group === 'Coverage')).toBe(true);
  });
});

describe('classics', () => {
  it('counts recurring occurrences in the headline total', () => {
    const c = y2025.classics;
    expect(c.completions).toBe(c.recurringCompletions + c.tasksFinished);
    expect(c.recurringCompletions).toBeGreaterThan(300);
  });
  it('normalizes priority (most tasks are P4 / none)', () => {
    const p = y2025.classics.priority;
    expect(p.p4).toBeGreaterThan(p.p1);
    expect(p.p1 + p.p2 + p.p3 + p.p4).toBe(y2025.classics.completions);
  });
  it('finds the biggest parent task by subtasks', () => {
    const moonTop = y2025.classics.topProject;
    expect(moonTop).not.toBeNull();
    const allParents = out.years.map((y) => y.classics.topProject?.biggestParent).filter(Boolean);
    expect(allParents.some((b) => b!.task.text === 'Rebuild the moon dome' && b!.subtasks === 8)).toBe(true);
  });
  it('computes streaks within coverage', () => {
    const s = y2025.classics.longestStreak!;
    expect(s.days).toBeGreaterThan(5);
    expect(s.start >= '2025-01-01' && s.end <= '2025-12-31').toBe(true);
  });
});

describe('habits', () => {
  it('heatmaps sum to totals', () => {
    const h = y2025.habits;
    expect(h.completionHeatmap.flat().reduce((a, b) => a + b, 0)).toBe(y2025.classics.completions);
    expect(h.creationHeatmap.flat().reduce((a, b) => a + b, 0)).toBe(y2025.classics.created);
  });
  it('calendar spans the full year', () => {
    expect(y2025.habits.calendar).toHaveLength(365);
  });
  it('detects the fixture night owl', () => {
    expect(y2025.habits.persona.id).toBe('night-owl');
  });
  it('counts reschedules from the event log', () => {
    expect(y2025.habits.reschedules.total).toBeGreaterThan(0);
    expect(y2025.habits.reschedules.pushedLater).toBe(y2025.habits.reschedules.total);
  });
  it('due timing buckets add up', () => {
    const d = y2025.habits.dueTiming;
    expect(d.early + d.onDay + d.late).toBe(d.withDue);
    expect(d.withDue + d.noDue).toBe(y2025.classics.completions);
  });
});

describe('themes and routines', () => {
  it('uses configured themes', () => {
    const names = y2025.themes.share.map((s) => s.theme);
    expect(names).toEqual(expect.arrayContaining(['Space Program', 'Garden', 'Clubs']));
  });
  it('measures adherence for parsed routines and flags the one that died', () => {
    const r = y2025.routines;
    const cactus = r.adherence.find((a) => a.task.text === 'Water the cactus')!;
    expect(cactus.rule).toBe('daily');
    expect(cactus.rate).toBeGreaterThan(0.7);
    expect(cactus.rate).toBeLessThan(1);
    expect(r.died.map((d) => d.task.text)).toContain('Check llama mood');
    // the deleted routine has no surviving rule → counted as unparsed, never estimated
    expect(r.unparsedRecurring).toBeGreaterThanOrEqual(1);
  });
  it('finds milestone keywords from config', () => {
    expect(y2025.themes.milestones.length).toBeGreaterThan(0);
    expect(y2025.themes.milestones.every((m) => /submit|apply|interview|rehears/i.test(m.task.text))).toBe(true);
  });
  it('includes the archived project rebuilt from events', () => {
    const volc = Object.entries(out.index.entities.projects).find(([, p]) => p.name === 'Volcano Lair Gift Shop');
    expect(volc?.[1].archived).toBe(true);
  });
});

describe('share-safe aliases', () => {
  it('aliases never contain real project, label, or section names', () => {
    const e = out.index.entities;
    const realNames = [...Object.values(e.projects), ...Object.values(e.labels), ...Object.values(e.sections)]
      .map((x) => x.name)
      .filter((n) => n !== 'Inbox');
    const aliases = [...Object.values(e.projects), ...Object.values(e.labels), ...Object.values(e.sections)].map((x) => x.alias);
    for (const a of aliases) for (const n of realNames) expect(a.toLowerCase()).not.toContain(n.toLowerCase());
  });
  it('uses theme-based aliases for configured themes', () => {
    const moon = Object.values(out.index.entities.projects).find((p) => p.name === 'Moon Base Renovation')!;
    expect(moon.alias).toMatch(/^Space Program \d+$/);
    const ownTheme = Object.values(out.index.entities.themes).filter((t) => !t.fromConfig);
    for (const t of ownTheme) expect(t.alias).not.toBe(t.name);
  });
  it('every task mention has a safe version without task text', () => {
    const refs = out.years.flatMap((y) => collectRefs(y));
    expect(refs.length).toBeGreaterThan(50);
    for (const r of refs) {
      expect(r.safe).toMatch(/^a task in /);
      if (r.text.length > 3) expect(r.safe.toLowerCase()).not.toContain(r.text.toLowerCase());
    }
  });
});

describe('data health', () => {
  it('flags unavailable groups instead of zeros', () => {
    const groups = Object.fromEntries(out.index.health.map((h) => [h.group, h.status]));
    expect(groups['Durations']).toBe('unavailable');
    expect(groups['Sharing']).toBe('unavailable');
    expect(groups['Routine adherence']).toBe('partial');
  });
});
