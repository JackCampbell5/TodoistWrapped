import { describe, expect, it } from 'vitest';
import { ExportAdapter } from '../src/pipeline/adapters/exportAdapter.ts';
import { buildAll } from '../src/pipeline/aggregate.ts';
import { loadThemeConfig } from '../src/pipeline/themes.ts';
import { compareRanks, compareYears, describeShift } from '../src/shared/yoy.ts';

describe('compareRanks', () => {
  const c = (id: string, count: number) => ({ id, count, share: 0 });
  it('marks climbers, fallers, new entries, and dropouts', () => {
    const a = [c('moon', 50), c('cactus', 40), c('llama', 30)];
    const b = [c('cactus', 60), c('moon', 45), c('book', 20)];
    const r = compareRanks(a, b, 3);
    expect(r.top.map((x) => [x.id, x.status, x.moved])).toEqual([['cactus', 'up', 1], ['moon', 'down', -1], ['book', 'new', 0]]);
    expect(r.dropped.map((x) => x.id)).toEqual(['llama']);
    expect(r.stayed).toEqual(['moon', 'cactus']);
  });
});

describe('compareYears on fixtures', async () => {
  const data = await new ExportAdapter('fixtures/export').load();
  const out = buildAll(data, { themeConfig: loadThemeConfig('fixtures/themes.fixture.json') });
  const y = (k: string) => out.years.find((x) => x.key === k)!;
  it('orders years and computes deltas regardless of argument order', () => {
    const r = compareYears(y('2026'), y('2025'));
    expect([r.a, r.b]).toEqual(['2025', '2026']);
    expect(r.completions.delta).toBe(y('2026').classics.completions - y('2025').classics.completions);
    expect(r.enough).toBe(true);
    expect(r.projects.top.length).toBeGreaterThan(0);
  });
  it('describes habit shifts in plain language', () => {
    const r = compareYears(y('2025'), y('2026'));
    const hour = r.shifts.find((s) => s.id === 'hour')!;
    expect(describeShift(hour)).toMatch(/finished tasks/);
    expect(describeShift({ id: 'ttc', a: 5, b: 2, delta: -3, unit: 'days' })).toBe('Procrastination down 3 days (median time from added to done).');
    expect(describeShift({ id: 'hour', a: 14, b: 15.5, delta: 1.5, unit: 'hours' })).toBe('You finished tasks 1.5 hrs later in the day.');
  });
  it('flags thin years as not enough history', () => {
    const thin = { ...y('2025'), key: '2023', label: '2023', classics: { ...y('2025').classics, completions: 4 } };
    const r = compareYears(thin, y('2025'));
    expect(r.enough).toBe(false);
    expect(r.reason).toMatch(/only 4 completions/);
  });
});
