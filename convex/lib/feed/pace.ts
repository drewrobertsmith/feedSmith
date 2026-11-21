const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A Feed's checks are never closer than this, nor further apart than that (T19). */
export const MIN_INTERVAL = 15 * MINUTE;
export const MAX_INTERVAL = 12 * HOUR;
/** The span a Feed's pace is judged over. */
export const PACE_WINDOW = 14 * DAY;

const BACKOFF_FIRST = 30 * MINUTE;
const BACKOFF_MAX = DAY;

/** The shortest span a pace is judged over, so one fresh Article doesn't look like a burst. */
const MIN_SPAN = DAY;

/**
 * How long until a working Feed's next check: about two checks per expected new Article,
 * judged from its Articles in the last 14 days. Many feeds list only their newest Articles,
 * so the rate is taken over the span those Articles cover (at least a day), not the whole
 * 14 days (T19).
 */
export function nextCheckIn(publishedAts: number[], now: number): number {
  const recent = publishedAts.filter((at) => at >= now - PACE_WINDOW && at <= now);
  if (recent.length === 0) return MAX_INTERVAL;
  const span = Math.max(MIN_SPAN, now - Math.min(...recent));
  const gap = span / recent.length;
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.round(gap / 2)));
}

/** How long until a failing Feed's next try, after `failures` in a row (Q7). */
export function backoff(failures: number): number {
  const steps = Math.min(Math.max(failures, 1) - 1, 20);
  return Math.min(BACKOFF_MAX, BACKOFF_FIRST * 2 ** steps);
}
