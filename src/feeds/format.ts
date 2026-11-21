// Hoisted: building an Intl formatter is slow, and every Article row uses it.
const DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** When an Article was published, in the phone's own date style ("21 Nov 2026"). */
export function publishedDate(ms: number): string {
  return DATE.format(ms);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * How long ago an Article was published: "just now", "5 min ago", "2 hr ago", "yesterday",
 * "4 days ago", "2 wk ago". Written out rather than Intl.RelativeTimeFormat, which Hermes on
 * Android doesn't have; feedSmith is English-only in v1.
 */
export function publishedAgo(ms: number, now: number): string {
  const elapsed = Math.max(0, now - ms);
  if (elapsed < MINUTE) return 'just now';
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} hr ago`;
  if (elapsed < 2 * DAY) return 'yesterday';
  if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)} days ago`;
  return `${Math.floor(elapsed / WEEK)} wk ago`;
}
