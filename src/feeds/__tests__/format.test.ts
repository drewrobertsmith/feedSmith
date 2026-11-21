import { publishedAgo } from '@/feeds/format';

const NOW = Date.UTC(2026, 10, 21, 14);
const MINUTE = 60_000;

test.each([
  ['moments ago', NOW - 20_000, 'now'],
  ['minutes ago', NOW - 5 * MINUTE, '5 min. ago'],
  ['hours ago', NOW - 2 * 60 * MINUTE, '2 hr. ago'],
  ['yesterday', NOW - 26 * 60 * MINUTE, 'yesterday'],
  ['days ago', NOW - 4 * 24 * 60 * MINUTE, '4 days ago'],
  ['a future date (a skewed clock)', NOW + 10 * MINUTE, 'now'],
])('%s reads as the phone would say it', (_case, at, expected) => {
  expect(publishedAgo(at, NOW)).toBe(expected);
});
