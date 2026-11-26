import { describe, expect, it } from 'vitest';
import { decodeDeadline, decodeEventDue, decodeItemDue, nyWallToUtc, parseTs, toLocal } from '../src/pipeline/time.ts';

describe('toLocal (America/New_York)', () => {
  it('shifts UTC to EST in winter and EDT in summer', () => {
    expect(toLocal('2026-01-15T03:30:00Z')).toMatchObject({ date: '2026-01-14', hour: 22, dow: 3 });
    expect(toLocal('2026-07-15T03:30:00Z')).toMatchObject({ date: '2026-07-14', hour: 23 });
  });
  it('tolerates microsecond timestamps', () => {
    expect(parseTs('2026-11-17T05:39:04.003889Z')).toBe(Date.parse('2026-11-17T05:39:04.003Z'));
  });
});

describe('nyWallToUtc', () => {
  it('handles both sides of DST', () => {
    expect(nyWallToUtc('2026-01-10T09:00:00')).toBe('2026-01-10T14:00:00.000Z');
    expect(nyWallToUtc('2026-07-10T09:00:00')).toBe('2026-07-10T13:00:00.000Z');
  });
});

describe('decodeEventDue', () => {
  it('recovers plain local dates from end-of-day UTC encodings', () => {
    expect(decodeEventDue('2026-11-18T04:59:59.000000Z')).toEqual({ date: '2026-11-17' }); // EST
    expect(decodeEventDue('2026-07-18T03:59:59.000000Z')).toEqual({ date: '2026-07-17' }); // EDT
    expect(decodeEventDue('2026-07-18T06:59:59.000000Z')).toEqual({ date: '2026-07-17' }); // Pacific (travel)
    expect(decodeEventDue('2026-07-17T21:59:59.000000Z')).toEqual({ date: '2026-07-17' }); // CEST (travel)
  });
  it('keeps timed dues as instants', () => {
    expect(decodeEventDue('2026-03-10T17:00:00.000000Z')).toEqual({ date: '2026-03-10', datetime: '2026-03-10T17:00:00.000Z' });
  });
  it('respects has_time when provided', () => {
    expect(decodeEventDue('2026-03-11T03:59:59.000000Z', true)?.datetime).toBeDefined();
    expect(decodeEventDue(null)).toBeUndefined();
  });
});

describe('decodeItemDue / decodeDeadline', () => {
  it('keeps date-only dues unshifted', () => {
    expect(decodeItemDue('2025-01-14')).toEqual({ date: '2025-01-14' });
  });
  it('treats floating datetimes as NY wall time', () => {
    expect(decodeItemDue('2025-01-14T09:30:00')).toEqual({ date: '2025-01-14', datetime: '2025-01-14T14:30:00.000Z' });
  });
  it('keeps the calendar date of midnight-UTC deadlines', () => {
    expect(decodeDeadline('2025-01-15T00:00:00Z')).toBe('2025-01-15');
  });
});
