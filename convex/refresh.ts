import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalAction, internalMutation, internalQuery, type ActionCtx } from './_generated/server';
import { DELETE_BATCH } from './lib/feed/blocks';
import { deleteArticles } from './lib/deleteArticles';
import { fetchFeed } from './lib/feed/fetch';
import { KEEP_NEWEST, markFailing, markWorking, RETENTION, scheduleOf, storeNewArticles } from './lib/feed/record';
import { bookNextFetch, ensureFetchBooked } from './lib/feed/timer';
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

/**
 * The fetch scheduler's run: starts a fetch for each Feed that's due (T19), leasing it meanwhile,
 * then books its next run for when the next Feed falls due (FEE-55).
 */
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
    // More were due than one run starts: the soonest is still due, so the next run is now.
    await bookNextFetch(ctx);
    return null;
  },
});

/**
 * The hourly safety check (FEE-55): books the fetch scheduler again if its run was lost, so Feeds
 * can't silently stop updating. With no Feeds, or a run already waiting, it does nothing.
 */
export const ensureFetchTimer = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ensureFetchBooked(ctx);
    return null;
  },
});

/** Feeds handed to their own cleanup per run. */
const FEEDS_PER_RUN = 100;

/**
 * Deletes Articles 30 days after publication (P14), Feed by Feed: each Feed keeps its `KEEP_NEWEST`
 * newest whatever their age, so a rare writer's page is never empty (FEE-93). Saved Articles stay until Done.
 */
export const cleanup = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page = await ctx.db.query('feeds').paginate({ cursor: args.cursor ?? null, numItems: FEEDS_PER_RUN });
    await Promise.all(page.page.map((feed) => ctx.scheduler.runAfter(0, internal.refresh.cleanupFeed, { feedId: feed._id, cursor: null })));
    // Once per run: Articles left by a removed Feed (kept while Saved, T23) belong to no Feed above.
    if (!args.cursor) await ctx.scheduler.runAfter(0, internal.refresh.cleanupOrphans, { cursor: null });
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.refresh.cleanup, { cursor: page.continueCursor });
    return null;
  },
});

/**
 * Old Articles whose Feed was removed: kept while Saved (T23), deleted once they're not. Paged by cursor
 * through every unsaved Article past retention, so the many that still have a Feed never stall it.
 */
export const cleanupOrphans = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query('articles')
      .withIndex('by_saved_published', (q) => q.eq('savedAt', undefined).lt('publishedAt', Date.now() - RETENTION))
      .paginate({ cursor, numItems: DELETE_BATCH });
    const feeds = await Promise.all(page.page.map((article) => ctx.db.get(article.feedId)));
    await deleteArticles(
      ctx,
      page.page.filter((_, i) => feeds[i] === null),
    );
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.refresh.cleanupOrphans, { cursor: page.continueCursor });
    return null;
  },
});

/**
 * One Feed's cleanup: pages through its Articles past retention, oldest first, deleting those that
 * aren't among its newest few or Saved. Paging by cursor gets past the ones it keeps, so a page of
 * kept or Saved Articles never stalls it, and identical publish times can't keep extra.
 */
export const cleanupFeed = internalMutation({
  args: { feedId: v.id('feeds'), cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, { feedId, cursor }) => {
    const newest = await ctx.db
      .query('articles')
      .withIndex('by_feed_published', (q) => q.eq('feedId', feedId))
      .order('desc')
      .take(KEEP_NEWEST);
    const keep = new Set(newest.map((article) => article._id));
    const page = await ctx.db
      .query('articles')
      .withIndex('by_feed_published', (q) => q.eq('feedId', feedId).lt('publishedAt', Date.now() - RETENTION))
      .paginate({ cursor, numItems: DELETE_BATCH });
    await deleteArticles(
      ctx,
      page.page.filter((article) => !keep.has(article._id) && article.savedAt === undefined),
    );
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.refresh.cleanupFeed, { feedId, cursor: page.continueCursor });
    return null;
  },
});
