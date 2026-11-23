import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
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

/**
 * FEE-62: moves each Article's page-reading state off the Article into `pageReads`, so reading
 * pages stops re-running All. `extracted` needs no row (its text is whole); `reading` becomes
 * `pending`, and each Feed with pages waiting gets a run, so none is stranded. Safe to run more
 * than once. Run once on each deployment straight after the deploy that
 * adds the table: `bunx convex run migrations:movePageReads`.
 */
export const movePageReads = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query('articles').paginate({ cursor: cursor ?? null, numItems: BATCH });
    const waiting = new Set<Id<'feeds'>>();
    for (const article of page.page) {
      if (article.extraction === undefined) continue;
      // A claim made by the code before this move belongs to a run that's gone, and its lease
      // check may already have missed it: the page is simply read again.
      const state = article.extraction === 'reading' ? 'pending' : article.extraction;
      if (state === 'pending') waiting.add(article.feedId);
      if (state !== 'extracted') {
        const existing = await ctx.db
          .query('pageReads')
          .withIndex('by_article', (q) => q.eq('articleId', article._id))
          .unique();
        if (!existing) {
          await ctx.db.insert('pageReads', { articleId: article._id, feedId: article.feedId, userId: article.userId, state });
        }
      }
      await ctx.db.patch(article._id, { extraction: undefined });
    }
    // A run booked before the move may already have found nothing and stopped: book one for each
    // Feed with pages waiting, so none is stranded. A second run at once is safe (`claim` decides).
    for (const feedId of waiting) await ctx.scheduler.runAfter(0, internal.extractPages.run, { feedId });
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.migrations.movePageReads, { cursor: page.continueCursor });
    return null;
  },
});
