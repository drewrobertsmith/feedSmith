import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { action, internalMutation, internalQuery, mutation, query, type QueryCtx } from './_generated/server';
import { requireUserId } from './lib/currentUser';
import { findFeedLinks, siteMeta, type FeedLink, type SiteMeta } from './lib/feed/discover';
import { faviconOf } from './lib/feed/face';
import { fetchFeed, type FetchOutcome } from './lib/feed/fetch';
import { safeUrl } from './lib/feed/http';
import { markWorking, storeNewArticles } from './lib/feed/record';
import { vAddFeedReason, vFeedChoice, vStoredArticle, vValidators, type AddFeedReason } from './lib/feed/validators';
import { inBatches, refreshOne } from './refresh';

const MAX_URL = 2048;
/** Pulling down skips a Feed fetched this recently, so repeated pulls can't hammer a site. */
const PULL_GAP = 2 * 60_000;
/** Feeds one pull fetches at most. */
const PULL_LIMIT = 200;
/** Fetches one pull runs at once: each can hold a couple of megabytes while it parses. */
const PULL_CONCURRENCY = 4;

const vAddResult = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({ ok: v.literal(false), reason: vAddFeedReason }),
  v.object({ ok: v.literal(false), reason: v.literal('choose'), choices: v.array(vFeedChoice) }),
  /** A Feed the User already follows, by the same URL: the app takes them back to it, by name. */
  v.object({ ok: v.literal(false), reason: v.literal('already-added'), title: v.string(), feedId: v.id('feeds') }),
);
type AddResult =
  | { ok: true }
  | { ok: false; reason: AddFeedReason }
  | { ok: false; reason: 'choose'; choices: FeedLink[] }
  | { ok: false; reason: 'already-added'; title: string; feedId: Id<'feeds'> };

/** A typed address without a scheme is a website: `theverge.com` means `https://theverge.com` (T21). */
function withScheme(typed: string): string {
  const trimmed = typed.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** What a Feed's site says about itself, read from its homepage; nothing when it can't be read. */
async function homepageMeta(siteUrl: string | undefined): Promise<SiteMeta> {
  if (!siteUrl) return {};
  const page = await fetchFeed(siteUrl);
  return page._tag === 'Page' ? siteMeta(page.body, page.url) : {};
}

/**
 * Adds a Feed for the signed-in User: fetches it at once under the fetch policy (T18),
 * and only a working feed becomes a Feed. The URL is never logged (Q9).
 */
export const add = action({
  args: { url: v.string() },
  returns: vAddResult,
  handler: async (ctx, { url }): Promise<AddResult> => {
    const userId = await ctx.runQuery(internal.feeds.viewer, {});
    // One spelling per Feed: the parsed URL, its host lower-cased and its spaces trimmed.
    const typed = url.length <= MAX_URL ? safeUrl(withScheme(url))?.href : undefined;
    if (!typed) return { ok: false, reason: 'invalid-url' };

    // Already followed at this URL: known before fetching anything.
    const following = await ctx.runQuery(internal.feeds.followed, { userId, url: typed });
    if (following !== null) return { ok: false, reason: 'already-added', ...following };

    let feedUrl = typed;
    let outcome: FetchOutcome = await fetchFeed(typed);
    let meta: SiteMeta | undefined;
    if (outcome._tag === 'Page') {
      // A web page: its feed links are its feeds, followed one level only (T21).
      const links = findFeedLinks(outcome.body, outcome.url);
      if (links.length === 0) return { ok: false, reason: 'no-feed-found' };
      if (links.length > 1) return { ok: false, reason: 'choose', choices: links };
      meta = siteMeta(outcome.body, outcome.url);
      feedUrl = links[0].url;
      const followingLink = await ctx.runQuery(internal.feeds.followed, { userId, url: feedUrl });
      if (followingLink !== null) return { ok: false, reason: 'already-added', ...followingLink };
      outcome = await fetchFeed(feedUrl);
    }
    if (outcome._tag === 'Failed') return { ok: false, reason: outcome.reason };
    // A feed link that led to another page: links are followed one level only (T21).
    if (outcome._tag === 'Page') return { ok: false, reason: 'not-a-feed' };
    // Without validators of ours, a "not modified" answer is no answer at all.
    if (outcome._tag === 'NotModified') return { ok: false, reason: 'unreachable' };
    meta ??= await homepageMeta(outcome.siteUrl);

    const stored = await ctx.runMutation(internal.feeds.store, {
      userId,
      url: feedUrl,
      title: meta.name ?? outcome.title,
      siteUrl: outcome.siteUrl,
      iconUrl: meta.iconUrl,
      articles: outcome.articles,
      now: Date.now(),
      ...outcome.validators,
    });
    return stored === null ? { ok: true } : { ok: false, reason: 'already-added', ...stored };
  },
});

/** Pulling down on Feeds: fetches every one of the signed-in User's Feeds now (P15). */
export const refreshAll = action({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const userId = await ctx.runQuery(internal.feeds.viewer, {});
    const feedIds = await ctx.runQuery(internal.feeds.toRefresh, { userId, now: Date.now() });
    await inBatches(feedIds, PULL_CONCURRENCY, (feedId) => refreshOne(ctx, feedId));
    return null;
  },
});

/** The signed-in User, for actions; refuses a signed-out caller (Q10). */
export const viewer = internalQuery({
  args: {},
  returns: v.id('users'),
  handler: (ctx) => requireUserId(ctx),
});

const vFollowed = v.union(v.null(), v.object({ title: v.string(), feedId: v.id('feeds') }));

/** The User's Feed at this exact URL (its name and id), or null when they don't follow it. */
export const followed = internalQuery({
  args: { userId: v.id('users'), url: v.string() },
  returns: vFollowed,
  handler: async (ctx, { userId, url }) => {
    const feed = await ctx.db
      .query('feeds')
      .withIndex('by_user_url', (q) => q.eq('userId', userId).eq('url', url))
      .first();
    return feed ? { title: feed.title, feedId: feed._id } : null;
  },
});

/** A User's Feeds that weren't fetched in the last couple of minutes. */
export const toRefresh = internalQuery({
  args: { userId: v.id('users'), now: v.number() },
  returns: v.array(v.id('feeds')),
  handler: async (ctx, { userId, now }) => {
    const feeds = await ctx.db
      .query('feeds')
      .withIndex('by_user_url', (q) => q.eq('userId', userId))
      .take(PULL_LIMIT);
    return feeds.filter((feed) => (feed.lastFetchedAt ?? 0) <= now - PULL_GAP).map((feed) => feed._id);
  },
});

/**
 * Saves a newly fetched Feed and its Articles, unless the User already follows it: then it
 * returns that Feed's name (checked again here, in case two adds raced). Null when stored.
 */
export const store = internalMutation({
  args: {
    userId: v.id('users'),
    url: v.string(),
    title: v.string(),
    siteUrl: v.optional(v.string()),
    iconUrl: v.optional(v.string()),
    articles: v.array(vStoredArticle),
    now: v.number(),
    ...vValidators,
  },
  returns: vFollowed,
  handler: async (ctx, { userId, url, title, siteUrl, iconUrl, articles, now, etag, lastModified }) => {
    const existing = await ctx.db
      .query('feeds')
      .withIndex('by_user_url', (q) => q.eq('userId', userId).eq('url', url))
      .first();
    if (existing) return { title: existing.title, feedId: existing._id };
    const feedId = await ctx.db.insert('feeds', { userId, url, title, siteUrl, iconUrl });
    await storeNewArticles(ctx, userId, feedId, articles, now);
    await markWorking(ctx, feedId, now, { etag, lastModified });
    return null;
  },
});

/** A link's or caller's id as one of the signed-in User's Feeds, or null (Q25). */
export async function ownFeed(ctx: QueryCtx, userId: Id<'users'>, rawId: string) {
  // Convex ids are well under 64 characters; longer strings aren't worth normalising.
  const feedId = rawId.length <= 64 ? ctx.db.normalizeId('feeds', rawId) : null;
  const feed = feedId ? await ctx.db.get(feedId) : null;
  return feed && feed.userId === userId ? feed : null;
}

/** The User's Pinned Feeds in their order, read straight from the Pin index. */
function pinnedFeeds(ctx: QueryCtx, userId: Id<'users'>) {
  return ctx.db
    .query('feeds')
    .withIndex('by_user_pin', (q) => q.eq('userId', userId).gte('pinOrder', 0))
    .take(MAX_PINS + 1);
}

/** A User has at most this many Pinned Feeds (P9). */
export const MAX_PINS = 3;
/** Chips are a User's Feeds; more than this many isn't a reading list any more. */
const CHIP_LIMIT = 200;

/**
 * The chip row (P5, P9): the signed-in User's Feeds, Pinned first in their order, then the
 * rest by their newest Article. Never a feed URL (Q9).
 */
export const chips = query({
  args: {},
  returns: v.array(
    v.object({ id: v.id('feeds'), title: v.string(), faviconUrl: v.optional(v.string()), pinned: v.boolean() }),
  ),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    // Pinned Feeds come from their own index, so they're never lost among many Feeds.
    const pinned = await pinnedFeeds(ctx, userId);
    const pinnedIds = new Set(pinned.map((feed) => feed._id));
    const others = (
      await ctx.db
        .query('feeds')
        .withIndex('by_user_url', (q) => q.eq('userId', userId))
        .take(CHIP_LIMIT)
    ).filter((feed) => !pinnedIds.has(feed._id));
    const feeds = [...pinned, ...others];
    const newest = await Promise.all(
      feeds.map(async (feed) => {
        const latest = await ctx.db
          .query('articles')
          .withIndex('by_feed_published', (q) => q.eq('feedId', feed._id))
          .order('desc')
          .first();
        return latest?.publishedAt ?? 0;
      }),
    );
    const ranked = feeds.map((feed, i) => ({ feed, newest: newest[i] }));
    ranked.sort((x, y) => {
      const xPin = x.feed.pinOrder;
      const yPin = y.feed.pinOrder;
      if (xPin !== undefined || yPin !== undefined) {
        if (xPin === undefined) return 1;
        if (yPin === undefined) return -1;
        return xPin - yPin;
      }
      return y.newest - x.newest;
    });
    return ranked.map(({ feed }) => {
      const chip: { id: typeof feed._id; title: string; faviconUrl?: string; pinned: boolean } = {
        id: feed._id,
        title: feed.title,
        pinned: feed.pinOrder !== undefined,
      };
      const faviconUrl = faviconOf(feed);
      if (faviconUrl) chip.faviconUrl = faviconUrl;
      return chip;
    });
  },
});

/** Pins or unpins one of the signed-in User's Feeds (P9). A fourth Pin is refused. */
export const setPinned = mutation({
  args: { id: v.string(), pinned: v.boolean() },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({ ok: v.literal(false), reason: v.union(v.literal('pins-full'), v.literal('not-found')) }),
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const feed = await ownFeed(ctx, userId, args.id);
    if (!feed) return { ok: false as const, reason: 'not-found' as const };
    if (!args.pinned) {
      if (feed.pinOrder !== undefined) await ctx.db.patch(feed._id, { pinOrder: undefined });
      return { ok: true as const };
    }
    if (feed.pinOrder !== undefined) return { ok: true as const };
    const pins = (await pinnedFeeds(ctx, userId)).map((f) => f.pinOrder ?? 0);
    if (pins.length >= MAX_PINS) return { ok: false as const, reason: 'pins-full' as const };
    await ctx.db.patch(feed._id, { pinOrder: Math.max(0, ...pins) + 1 });
    return { ok: true as const };
  },
});

/** A Feed's name: what the User sees on its chip and in Manage Feeds. */
const MAX_NAME = 100;
/** Articles (with their bodies) deleted per batch after a Feed is removed. */
const REMOVE_BATCH = 50;

/**
 * Manage Feeds (D13): every one of the signed-in User's Feeds, Pinned first in their order,
 * then by name. Each shows its site host, never its URL (Q9), and whether it's working (P15).
 */
export const manage = query({
  args: {},
  returns: v.array(
    v.object({
      id: v.id('feeds'),
      title: v.string(),
      faviconUrl: v.optional(v.string()),
      host: v.string(),
      pinned: v.boolean(),
      working: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const feeds = await ctx.db
      .query('feeds')
      .withIndex('by_user_url', (q) => q.eq('userId', userId))
      .take(CHIP_LIMIT);
    feeds.sort((x, y) => {
      if (x.pinOrder !== undefined || y.pinOrder !== undefined) {
        if (x.pinOrder === undefined) return 1;
        if (y.pinOrder === undefined) return -1;
        return x.pinOrder - y.pinOrder;
      }
      return x.title.localeCompare(y.title, undefined, { sensitivity: 'base' });
    });
    return feeds.map((feed) => {
      const row: {
        id: typeof feed._id;
        title: string;
        faviconUrl?: string;
        host: string;
        pinned: boolean;
        working: boolean;
      } = {
        id: feed._id,
        title: feed.title,
        host: new URL(feed.url).hostname,
        pinned: feed.pinOrder !== undefined,
        working: feed.status !== 'failing',
      };
      const faviconUrl = faviconOf(feed);
      if (faviconUrl) row.faviconUrl = faviconUrl;
      return row;
    });
  },
});

/** Renames one of the signed-in User's Feeds: its chip, its Articles' Feed name, everywhere. */
export const rename = mutation({
  args: { id: v.string(), title: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true) }),
    v.object({ ok: v.literal(false), reason: v.union(v.literal('invalid-name'), v.literal('not-found')) }),
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const feed = await ownFeed(ctx, userId, args.id);
    if (!feed) return { ok: false as const, reason: 'not-found' as const };
    const title = args.title.replace(/\s+/g, ' ').trim();
    if (!title || title.length > MAX_NAME) return { ok: false as const, reason: 'invalid-name' as const };
    await ctx.db.patch(feed._id, { title });
    return { ok: true as const };
  },
});

/**
 * Removes one of the signed-in User's Feeds and its Articles (T23). The Feed goes at once;
 * its Articles follow in batches, and All never shows them meanwhile.
 */
export const remove = mutation({
  args: { id: v.string() },
  returns: v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), reason: v.literal('not-found') })),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const feed = await ownFeed(ctx, userId, args.id);
    if (!feed) return { ok: false as const, reason: 'not-found' as const };
    await ctx.db.delete(feed._id);
    await ctx.scheduler.runAfter(0, internal.feeds.removeArticles, { feedId: feed._id });
    return { ok: true as const };
  },
});

/** Deletes a removed Feed's Articles and their bodies, a batch at a time. Saved ones stay once Saved exists (T23, FEE-30). */
export const removeArticles = internalMutation({
  args: { feedId: v.id('feeds') },
  returns: v.null(),
  handler: async (ctx, { feedId }) => {
    const articles = await ctx.db
      .query('articles')
      .withIndex('by_feed_published', (q) => q.eq('feedId', feedId))
      .take(REMOVE_BATCH);
    await Promise.all(
      articles.map(async (article) => {
        const bodies = await ctx.db
          .query('articleBodies')
          .withIndex('by_article', (q) => q.eq('articleId', article._id))
          .take(10);
        await Promise.all(bodies.map((body) => ctx.db.delete(body._id)));
        await ctx.db.delete(article._id);
      }),
    );
    if (articles.length === REMOVE_BATCH) await ctx.scheduler.runAfter(0, internal.feeds.removeArticles, { feedId });
    return null;
  },
});

/** Sets the order of the signed-in User's Pinned Feeds: `ids` must be exactly those Feeds (P9). */
export const orderPins = mutation({
  args: { ids: v.array(v.string()) },
  returns: v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), reason: v.literal('not-pinned') })),
  handler: async (ctx, { ids }) => {
    const userId = await requireUserId(ctx);
    const pinned = await pinnedFeeds(ctx, userId);
    const byId = new Map(pinned.map((feed) => [feed._id as string, feed]));
    const same = ids.length === pinned.length && new Set(ids).size === ids.length && ids.every((id) => byId.has(id));
    if (!same) return { ok: false as const, reason: 'not-pinned' as const };
    await Promise.all(ids.map((id, i) => ctx.db.patch(byId.get(id)!._id, { pinOrder: i + 1 })));
    return { ok: true as const };
  },
});
