import { DAY, HOUR, RateLimiter } from '@convex-dev/rate-limiter';

import { components } from './_generated/api';

/**
 * Guessing searches one User may start, refilled at this rate per hour (FEE-88, T36). The owner
 * tunes it here; searches answered without guessing are never counted.
 */
export const GUESSES_PER_HOUR = 10;

/**
 * Pages one Feed may have read (T24): a new Feed's first fetch, at most this many at once, then this many a day. A
 * Feed whose content turns hostile can't aim the server at a site beyond that; past it, Articles fall back.
 */
export const PAGE_BURST = 100;
export const PAGES_PER_DAY = 50;

/**
 * feedSmith's rate limits, keyed by User id, or by Feed id for a Feed's pages: User data either way, cleared when the
 * Account is deleted, and a Feed's when it's removed (Q28).
 */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  guessingSearch: { kind: 'token bucket', rate: GUESSES_PER_HOUR, period: HOUR, capacity: GUESSES_PER_HOUR },
  pageRead: { kind: 'token bucket', rate: PAGES_PER_DAY, period: DAY, capacity: PAGE_BURST },
});
