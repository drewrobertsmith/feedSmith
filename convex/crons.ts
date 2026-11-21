import { cronJobs } from 'convex/server';

import { internal } from './_generated/api';

const crons = cronJobs();

// Each Feed keeps its own next check (T19); this only starts the ones that are due.
crons.interval('fetch due Feeds', { minutes: 5 }, internal.refresh.scheduleDue, {});

// Articles that aren't Saved go 30 days after publication (P14).
crons.daily('clean up old Articles', { hourUTC: 9, minuteUTC: 0 }, internal.refresh.cleanup, {});

export default crons;
