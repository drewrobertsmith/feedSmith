import { HOUR, RateLimiter } from '@convex-dev/rate-limiter';

import { components } from './_generated/api';

/**
 * Guessing searches one User may start, refilled at this rate per hour (FEE-88, T36). The owner
 * tunes it here; searches answered without guessing are never counted.
 */
export const GUESSES_PER_HOUR = 10;

/** feedSmith's rate limits, each keyed by User id: User data, cleared when the Account is deleted (Q28). */
export const rateLimiter = new RateLimiter(components.rateLimiter, {
  guessingSearch: { kind: 'token bucket', rate: GUESSES_PER_HOUR, period: HOUR, capacity: GUESSES_PER_HOUR },
});
