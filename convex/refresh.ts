import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalAction, internalMutation, internalQuery, type ActionCtx } from './_generated/server';
import { DELETE_BATCH } from './lib/feed/blocks';
import { deleteArticles } from './lib/deleteArticles';
import { fetchFeed } from './lib/feed/fetch';
import { markFailing, markWorking, RETENTION, scheduleOf, storeNewArticles } from './lib/feed/record';
import { vStoredArticle, vValidators } from './lib/feed/validators';

/** How long a Feed handed to a fetch stays out of the next tick, so a slow fetch isn't doubled. */
const LEASE = 10 * 60_000;
/** Feeds started per tick; the rest wait for the next one. */
const PER_TICK = 50;
/** Fetches one Feed and records what happened. Shared by the cron and pulling down. */
export async function refreshOne(ctx: ActionCtx, feedId: Id<'feeds'>) {
  const feed = await ctx.runQuery(internal.refresh.forRefresh, { feedId });
  if (!feed) return;
  try {
    const outcome = await fetchFeed(feed.url, { etag: feed.etag, lastModified: feed.lastModified });
    const now = Date.now();
    if (outcome._tag === 'Fetched') {
      await ctx.runMutation(internal.refresh.recordFetch, {
        feedId,
        now,
        siteUrl: outcome.siteUrl,
        articles: outcome.articles,
        ...outcome.validators,
      });
    } else if (outcome._tag === 'NotModified') {
      await ctx.runMutation(internal.refresh.recordNotModified, { feedId, now });
    } else {
      // Failed, or a page where a feed used to be: either way the Feed isn't working.
      await ctx.runMutation(internal.refresh.recordFailure, { feedId, now });
    }
  } catch {
    // Anything unexpected (a limit hit while storing) still counts as a failure, so the Feed
    // backs off instead of retrying when its lease ends. The error isn't logged: it may carry the URL (Q9).
    await ctx.runMutation(internal.refresh.recordFailure, { feedId, now: Date.now() });
  }
}

/** Runs `work` over `items`, at most `limit` at a time. */
export async function inBatches<T>(items: T[], limit: number, work: (item: T) => Promise<void>) {
  let next = 0;
  const lane = async () => {
    while (next < items.length) await work(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
}

/** What a fetch needs to know about a Feed. Internal: the URL never leaves the server (Q9). */
export const forRefresh = internalQuery({
  args: { feedId: v.id('feeds') },
  returns: v.union(v.null(), v.object({ url: v.string(), ...vValidators })),
  handler: async (ctx, { feedId }) => {
    const feed = await ctx.db.get(feedId);
    if (!feed) return null;
    // A Feed stored before it knew its site is fetched in full once, so it learns it (FEE-27).
    if (!feed.siteUrl) return { url: feed.url };
    const schedule = await scheduleOf(ctx, feedId);
    return { url: feed.url, etag: schedule?.etag, lastModified: schedule?.lastModified };
  },
});

export const recordFetch = internalMutation({
  args: {
    feedId: v.id('feeds'),
    now: v.number(),
    siteUrl: v.optional(v.string()),
    articles: v.array(vStoredArticle),
    ...vValidators,
  },
  returns: v.null(),
  handler: async (ctx, { feedId, now, siteUrl, articles, etag, lastModified }) => {
    const feed = await ctx.db.get(feedId);
    // Gone, or a newer fetch already finished: an older result never overwrites it.
    if (!feed || ((await scheduleOf(ctx, feedId))?.lastFetchedAt ?? 0) > now) return null;
    if (siteUrl && siteUrl !== feed.siteUrl) await ctx.db.patch(feedId, { siteUrl });
    await storeNewArticles(ctx, feed.userId, feedId, articles, now);
    await markWorking(ctx, feedId, now, { etag, lastModified });
    return null;
  },
});

export const recordNotModified = internalMutation({
  args: { feedId: v.id('feeds'), now: v.number() },
  returns: v.null(),
  handler: async (ctx, { feedId, now }) => {
    const schedule = await scheduleOf(ctx, feedId);
    if ((schedule?.lastFetchedAt ?? 0) <= now) await markWorking(ctx, feedId, now);
    return null;
  },
});

export const recordFailure = internalMutation({
  args: { feedId: v.id('feeds'), now: v.number() },
  returns: v.null(),
  handler: async (ctx, { feedId, now }) => {
    await markFailing(ctx, feedId, now);
    return null;
  },
});

export const refreshFeed = internalAction({
  args: { feedId: v.id('feeds') },
  returns: v.null(),
  handler: async (ctx, { feedId }) => {
    await refreshOne(ctx, feedId);
    return null;
  },
});

/** The cron's tick: starts a fetch for each Feed that's due (T19), leasing it meanwhile. */
export const scheduleDue = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query('feedSchedules')
      .withIndex('by_next_fetch', (q) => q.lte('nextFetchAt', now))
      .take(PER_TICK);
    await Promise.all(
      due.map(async (schedule) => {
        // The lease goes on the schedule, never the Feed, so it re-runs nothing on screen (FEE-54).
        await ctx.db.patch(schedule._id, { nextFetchAt: now + LEASE });
        await ctx.scheduler.runAfter(0, internal.refresh.refreshFeed, { feedId: schedule.feedId });
      }),
    );
    // More were due than one tick starts: come straight back for the rest.
    if (due.length === PER_TICK) await ctx.scheduler.runAfter(0, internal.refresh.scheduleDue, {});
    return null;
  },
});

/** Deletes Articles 30 days after publication (P14), a batch at a time. Saved is exempt once it exists (FEE-30). */
export const cleanup = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const old = await ctx.db
      .query('articles')
      .withIndex('by_published', (q) => q.lt('publishedAt', Date.now() - RETENTION))
      .take(DELETE_BATCH);
    await deleteArticles(ctx, old);
    if (old.length === DELETE_BATCH) await ctx.scheduler.runAfter(0, internal.refresh.cleanup, {});
    return null;
  },
});
