import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';
import { ensureFetchBooked } from './lib/feed/timer';

const BATCH = 100;

/**
 * FEE-54: moves each Feed's fetch schedule off the Feed into `feedSchedules`, keeping it exactly,
 * so no Feed is fetched early or skipped. A Feed with no next check yet stays due now. Safe to
 * run more than once. Run once on each deployment: `bunx convex run migrations:moveFeedSchedules`.
 */
export const moveFeedSchedules = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query('feeds').paginate({ cursor: cursor ?? null, numItems: BATCH });
    for (const feed of page.page) {
      const existing = await ctx.db
        .query('feedSchedules')
        .withIndex('by_feed', (q) => q.eq('feedId', feed._id))
        .unique();
      if (!existing) {
        await ctx.db.insert('feedSchedules', {
          feedId: feed._id,
          userId: feed.userId,
          nextFetchAt: feed.nextFetchAt ?? 0,
          lastFetchedAt: feed.lastFetchedAt,
          failures: feed.failures ?? 0,
          etag: feed.etag,
          lastModified: feed.lastModified,
        });
      }
      // Only a Feed that still has them: rewriting the rest would re-run every open chip row.
      const moved = ['nextFetchAt', 'lastFetchedAt', 'failures', 'etag', 'lastModified'] as const;
      if (moved.some((field) => feed[field] !== undefined)) {
        await ctx.db.patch(feed._id, {
          nextFetchAt: undefined,
          lastFetchedAt: undefined,
          failures: undefined,
          etag: undefined,
          lastModified: undefined,
        });
      }
    }
    // Moved Feeds are due when they were: the fetch scheduler wakes for them (FEE-55).
    await ensureFetchBooked(ctx);
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.migrations.moveFeedSchedules, { cursor: page.continueCursor });
    return null;
  },
});
