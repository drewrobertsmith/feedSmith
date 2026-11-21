const NOW = Date.UTC(2026, 10, 21, 14);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Hermes on Android has no Intl.RelativeTimeFormat; the format must not need it.
const original = Intl.RelativeTimeFormat;
beforeAll(() => {
  // @ts-expect-error: removing it, as Hermes doesn't have it
  delete Intl.RelativeTimeFormat;
});
afterAll(() => {
  Object.defineProperty(Intl, 'RelativeTimeFormat', { value: original, configurable: true, writable: true });
});

const load = () => {
  let format: typeof import('@/feeds/format') | undefined;
  jest.isolateModules(() => {
    format = require('@/feeds/format');
  });
  return format!;
};

test('loads without Intl.RelativeTimeFormat, as on Hermes', () => {
  expect(() => load()).not.toThrow();
});

test.each([
  ['moments ago', NOW - 20_000, 'just now'],
  ['a future date (a skewed clock)', NOW + 10 * MINUTE, 'just now'],
  ['one minute', NOW - MINUTE, '1 min ago'],
  ['minutes ago', NOW - 5 * MINUTE, '5 min ago'],
  ['hours ago', NOW - 2 * HOUR, '2 hr ago'],
  ['yesterday', NOW - 26 * HOUR, 'yesterday'],
  ['days ago', NOW - 4 * DAY, '4 days ago'],
  ['weeks ago', NOW - 15 * DAY, '2 wk ago'],
])('%s reads as "%s"', (_case, at, expected) => {
  expect(load().publishedAgo(at, NOW)).toBe(expected);
});
