// Hoisted: building an Intl formatter is slow, and every Article row uses it.
const DATE = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

/** When an Article was published, in the phone's own date style ("21 Nov 2026"). */
export function publishedDate(ms: number): string {
  return DATE.format(ms);
}
