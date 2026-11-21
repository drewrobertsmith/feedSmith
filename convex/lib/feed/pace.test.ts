import { describe, expect, test } from 'vitest';

import { backoff, MAX_INTERVAL, MIN_INTERVAL, nextCheckIn } from './pace';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 10, 21, 12);

/** `count` Articles evenly spread over the last `days`. */
const published = (count: number, days = 14) =>
  Array.from({ length: count }, (_, i) => NOW - ((i + 1) * days * DAY) / count);

describe('each Feed on its own pace (T19)', () => {
  test('a busy Feed is checked at most every 15 minutes', () => {
    expect(nextCheckIn(published(14 * 100), NOW)).toBe(MIN_INTERVAL);
    // The Verge, about 40 a day: every 18 minutes.
    expect(nextCheckIn(published(14 * 40), NOW)).toBe(18 * MINUTE);
    expect(MIN_INTERVAL).toBe(15 * MINUTE);
  });

  test('about two checks per expected new Article', () => {
    // 4 a day: one every 6 hours, so checked every 3 hours.
    expect(nextCheckIn(published(14 * 4), NOW)).toBe(3 * HOUR);
  });

  test("a Feed that only lists its newest Articles is judged by the span they cover, not the whole 14 days", () => {
    // The Verge's feed holds its newest ~30, about a day's worth: 30 a day, so every 24 minutes.
    expect(nextCheckIn(published(30, 1), NOW)).toBe(24 * MINUTE);
  });

  test('a single fresh Article is not a burst: the span is at least a day', () => {
    expect(nextCheckIn([NOW - HOUR], NOW)).toBe(MAX_INTERVAL);
    expect(nextCheckIn([NOW - HOUR, NOW - 2 * HOUR], NOW)).toBe(6 * HOUR);
  });

  test('a quiet Feed is still checked at least every 12 hours', () => {
    expect(nextCheckIn(published(2), NOW)).toBe(MAX_INTERVAL);
    expect(MAX_INTERVAL).toBe(12 * HOUR);
  });

  test('a Feed with nothing in the last 14 days is checked every 12 hours', () => {
    expect(nextCheckIn([], NOW)).toBe(MAX_INTERVAL);
    expect(nextCheckIn([NOW - 20 * DAY, NOW - 40 * DAY], NOW)).toBe(MAX_INTERVAL);
  });

  test('future-dated Articles count as now, not as a burst to come', () => {
    expect(nextCheckIn([NOW + 30 * DAY], NOW)).toBe(MAX_INTERVAL);
  });
});

describe('a failing Feed backs off (Q7)', () => {
  test('doubling from 30 minutes', () => {
    expect([1, 2, 3, 4].map(backoff)).toEqual([30 * MINUTE, HOUR, 2 * HOUR, 4 * HOUR]);
  });

  test('never more than a day apart, however long it fails', () => {
    expect(backoff(50)).toBe(DAY);
    expect(backoff(10_000)).toBe(DAY);
  });

  test('never sooner than its first step', () => {
    expect(backoff(0)).toBe(30 * MINUTE);
  });
});
