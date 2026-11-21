// Hoisted: building an Intl formatter is slow, and every Article row uses it.
const DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** When an Article was published, in the phone's own date style ("21 Nov 2026"). */
export function publishedDate(ms: number): string {
  return DATE.format(ms);
}

const SECOND = 1000;
const STEPS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600 * SECOND],
  ['month', 30 * 24 * 3600 * SECOND],
  ['week', 7 * 24 * 3600 * SECOND],
  ['day', 24 * 3600 * SECOND],
  ['hour', 3600 * SECOND],
  ['minute', 60 * SECOND],
];

// Hoisted, like DATE. `numeric: 'auto'` says "now" and "yesterday".
const AGO = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' });

/** How long ago an Article was published, in the phone's own words ("2 hr. ago", "yesterday"). */
export function publishedAgo(ms: number, now: number): string {
  const elapsed = Math.max(0, now - ms);
  for (const [unit, size] of STEPS) {
    if (elapsed >= size) return AGO.format(-Math.floor(elapsed / size), unit);
  }
  return AGO.format(0, 'second');
}
