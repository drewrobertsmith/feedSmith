import { cronJobs } from 'convex/server';

import { internal } from './_generated/api';

const crons = cronJobs();

// Feeds are fetched by a run booked for when the next one is due (T19, FEE-55). This hourly check
// only books that run again if it was lost (a failed deploy, a crash); otherwise it does nothing.
crons.hourly('keep the fetch scheduler booked', { minuteUTC: 7 }, internal.refresh.ensureFetchTimer, {});

// Articles that aren't Saved go 30 days after publication (P14).
crons.daily('clean up old Articles', { hourUTC: 9, minuteUTC: 0 }, internal.refresh.cleanup, {});

// Catalog entries not seen for a year are dropped (FEE-80, T35).
crons.daily('forget stale catalog entries', { hourUTC: 9, minuteUTC: 30 }, internal.catalog.forget, {});

export default crons;
