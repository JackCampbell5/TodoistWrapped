import { describe, expect, it } from 'vitest';
import { adherence, expectedSlots, parseRecurrence } from '../src/pipeline/recurrence.ts';

describe('parseRecurrence', () => {
  it.each([
    ['every day', { kind: 'daily', interval: 1 }],
    ['every! day at 9pm', { kind: 'daily', interval: 1 }],
    ['every other day', { kind: 'daily', interval: 2 }],
    ['every 3 days', { kind: 'daily', interval: 3 }],
    ['every weekday', { kind: 'weekdays' }],
    ['every workday', { kind: 'weekdays' }],
    ['every week', { kind: 'weekly', interval: 1 }],
    ['every other week', { kind: 'weekly', interval: 2 }],
    ['every mon, thu', { kind: 'weekly', interval: 1, days: [1, 4] }],
    ['every tues, thur', { kind: 'weekly', interval: 1, days: [2, 4] }],
    ['every sat and sun', { kind: 'weekly', interval: 1, days: [0, 6] }],
    ['every 15th', { kind: 'monthly', interval: 1 }],
    ['every month starting jan 3', { kind: 'monthly', interval: 1 }],
    ['every year', { kind: 'yearly' }],
  ])('%s', (s, rule) => {
    expect(parseRecurrence(s)).toEqual(rule);
  });
  it('returns null for things it cannot read confidently', () => {
    expect(parseRecurrence('every 3 hours')).toBeNull();
    expect(parseRecurrence('every 3/15')).toBeNull();
    expect(parseRecurrence(undefined)).toBeNull();
  });
});

describe('adherence', () => {
  it('counts daily slots and the longest unbroken chain', () => {
    const rule = parseRecurrence('every day')!;
    const done = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-05', '2026-01-06'];
    expect(adherence(rule, done, '2026-01-01', '2026-01-10')).toEqual({ expected: 10, completed: 5, rate: 0.5, longestChain: 3 });
  });
  it('skips weekends for weekday rules and counts a Saturday catch-up toward Friday', () => {
    const rule = parseRecurrence('every weekday')!;
    // 2026-01-05 is a Monday
    expect(expectedSlots(rule, '2026-01-05', '2026-01-11')).toHaveLength(5);
    const a = adherence(rule, ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-10'], '2026-01-05', '2026-01-11');
    expect(a).toMatchObject({ expected: 5, completed: 5, longestChain: 5 });
  });
  it('handles specific weekdays', () => {
    const rule = parseRecurrence('every mon, thu')!;
    const a = adherence(rule, ['2026-01-05', '2026-01-08', '2026-01-15'], '2026-01-05', '2026-01-18');
    expect(a).toMatchObject({ expected: 4, completed: 3, longestChain: 2 });
  });
  it('handles weekly cadence without fixed days', () => {
    const rule = parseRecurrence('every week')!;
    const a = adherence(rule, ['2026-01-01', '2026-01-09', '2026-01-23'], '2026-01-01', '2026-01-28');
    expect(a).toMatchObject({ expected: 4, completed: 3, longestChain: 2 });
  });
});
