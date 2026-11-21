import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalAction, internalMutation, internalQuery, type ActionCtx } from './_generated/server';
import { fetchFeed } from './lib/feed/fetch';
import { markFailing, markWorking, RETENTION, storeNewArticles } from './lib/feed/record';
import { vStoredArticle } from './lib/feed/validators';

/** How long a Feed handed to a fetch stays out of the next tick, so a slow fetch isn't doubled. */
const LEASE = 10 * 60_000;
/** Feeds started per tick; the rest wait for the next one. */
const PER_TICK = 50;
/** Articles deleted per cleanup run; a backlog continues in a follow-up run. */
const CLEANUP_BATCH = 250;

const vValidators = { etag: v.optional(v.string()), lastModified: v.optional(v.string()) };

/** Fetches one Feed and records what happened. Shared by the cron and pulling down. */
export async function refreshOne(ctx: ActionCtx, feedId: Id<'feeds'>) {
  const feed = await ctx.runQuery(internal.refresh.forRefresh, { feedId });
  if (!feed) return;
  const outcome = await fetchFeed(feed.url, { etag: feed.etag, lastModified: feed.lastModified });
  const now = Date.now();
  if (outcome._tag === 'Fetched') {
    await ctx.runMutation(internal.refresh.recordFetch, {
      feedId,
      now,
      articles: outcome.articles,
      ...outcome.validators,
    });
  } else if (outcome._tag === 'NotModified') {
    await ctx.runMutation(internal.refresh.recordNotModified, { feedId, now });
  } else {
    await ctx.runMutation(internal.refresh.recordFailure, { feedId, now });
  }
}

/** What a fetch needs to know about a Feed. Internal: the URL never leaves the server (Q9). */
export const forRefresh = internalQuery({
  args: { feedId: v.id('feeds') },
  returns: v.union(v.null(), v.object({ url: v.string(), ...vValidators })),
  handler: async (ctx, { feedId }) => {
    const feed = await ctx.db.get(feedId);
    return feed ? { url: feed.url, etag: feed.etag, lastModified: feed.lastModified } : null;
  },
});

export const recordFetch = internalMutation({
  args: { feedId: v.id('feeds'), now: v.number(), articles: v.array(vStoredArticle), ...vValidators },
  returns: v.null(),
  handler: async (ctx, { feedId, now, articles, etag, lastModified }) => {
    const feed = await ctx.db.get(feedId);
    if (!feed) return null;
    await storeNewArticles(ctx, feed.userId, feedId, articles, now);
    await markWorking(ctx, feedId, now, { etag, lastModified });
    return null;
  },
});

export const recordNotModified = internalMutation({
  args: { feedId: v.id('feeds'), now: v.number() },
  returns: v.null(),
  handler: async (ctx, { feedId, now }) => {
    if (await ctx.db.get(feedId)) await markWorking(ctx, feedId, now);
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
      .query('feeds')
      .withIndex('by_next_fetch', (q) => q.lte('nextFetchAt', now))
      .take(PER_TICK);
    await Promise.all(
      due.map(async (feed) => {
        await ctx.db.patch(feed._id, { nextFetchAt: now + LEASE });
        await ctx.scheduler.runAfter(0, internal.refresh.refreshFeed, { feedId: feed._id });
      }),
    );
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
      .take(CLEANUP_BATCH);
    await Promise.all(
      old.map(async (article) => {
        const bodies = await ctx.db
          .query('articleBodies')
          .withIndex('by_article', (q) => q.eq('articleId', article._id))
          .take(10);
        await Promise.all(bodies.map((body) => ctx.db.delete(body._id)));
        await ctx.db.delete(article._id);
      }),
    );
    if (old.length === CLEANUP_BATCH) await ctx.scheduler.runAfter(0, internal.refresh.cleanup, {});
    return null;
  },
});
