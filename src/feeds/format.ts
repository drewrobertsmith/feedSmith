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

/**
 * Who wrote an Article, as a byline (FEE-41): "By Emma Roth", "By A and B", "By A, B and C",
 * and beyond three "By A, B and 2 others". Undefined when nobody is credited.
 */
export function byline(authors: readonly string[] | undefined): string | undefined {
  if (!authors || authors.length === 0) return undefined;
  if (authors.length === 1) return `By ${authors[0]}`;
  if (authors.length <= 3) return `By ${authors.slice(0, -1).join(', ')} and ${authors[authors.length - 1]}`;
  return `By ${authors.slice(0, 2).join(', ')} and ${authors.length - 2} others`;
}
