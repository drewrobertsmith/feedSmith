import { v } from 'convex/values';

import { internal } from './_generated/api';
import { DELETE_BATCH } from './lib/feed/blocks';
import { deleteArticles } from './lib/deleteArticles';
import { MAX_FEED_NAME } from './lib/feedName';
import type { Id } from './_generated/dataModel';
import { action, internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from './_generated/server';
import { requireUserId } from './lib/currentUser';
import { findFeedLinks, siteMeta, type FeedLink, type SiteMeta } from './lib/feed/discover';
import { faviconOf, hostOf, siteHost } from './lib/feed/face';
import { fetchFeed, type FetchOutcome } from './lib/feed/fetch';
import { safeUrl } from './lib/feed/http';
import { markWorking, scheduleOf, storeNewArticles } from './lib/feed/record';
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
  /** Added: the new Feed, by its id, so the app can open its chip (FEE-45). */
  v.object({ ok: v.literal(true), feedId: v.id('feeds') }),
  v.object({ ok: v.literal(false), reason: vAddFeedReason }),
  v.object({ ok: v.literal(false), reason: v.literal('choose'), choices: v.array(vFeedChoice) }),
  /** A Feed the User already follows, by the same URL: the app takes them back to it, by name. */
  v.object({ ok: v.literal(false), reason: v.literal('already-added'), title: v.string(), feedId: v.id('feeds') }),
);
type AddResult =
  | { ok: true; feedId: Id<'feeds'> }
  | { ok: false; reason: AddFeedReason }
  | { ok: false; reason: 'choose'; choices: FeedLink[] }
  | { ok: false; reason: 'already-added'; title: string; feedId: Id<'feeds'> };

/** A typed address without a scheme is a website: `theverge.com` means `https://theverge.com` (T21). */
function withScheme(typed: string): string {
  const trimmed = typed.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** A site's bare address: no path beyond `/`, no query. What it declares is public (T35). */
function isHomepage(url: string): boolean {
  const parsed = new URL(url);
  return parsed.pathname === '/' && parsed.search === '' && parsed.hash === '';
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
    /** The homepage that declared the Feed, when it was a homepage: only then does it join the catalog (T35). */
    let declaredBy: string | undefined;
    if (outcome._tag === 'Page') {
      // A web page: its feed links are its feeds, followed one level only (T21).
      const links = findFeedLinks(outcome.body, outcome.url);
      if (links.length === 0) return { ok: false, reason: 'no-feed-found' };
      meta = siteMeta(outcome.body, outcome.url);
      // A bare site address is its public homepage; a page with a path or query may be personal.
      const homepage = isHomepage(typed) ? new URL(outcome.url).origin : undefined;
      if (links.length > 1) {
        if (homepage) {
          const first = { url: links[0].url, name: meta.name ?? links[0].title, siteUrl: homepage, iconUrl: meta.iconUrl };
          await ctx.scheduler.runAfter(0, internal.catalog.rememberDeclared, first);
        }
        return { ok: false, reason: 'choose', choices: links };
      }
      declaredBy = homepage;
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
    const title = meta.name ?? outcome.title;

    // A homepage's declared Feed joins the catalog; any other is only refreshed if already there (T35).
    const now = Date.now();
    if (declaredBy) {
      const host = siteHost(declaredBy);
      await ctx.runMutation(internal.catalog.remember, { url: feedUrl, name: title, host, siteUrl: declaredBy, iconUrl: meta.iconUrl, source: 'declared', now });
    } else {
      await ctx.runMutation(internal.catalog.touch, { url: feedUrl, name: title, iconUrl: meta.iconUrl, now });
    }

    const stored = await ctx.runMutation(internal.feeds.store, {
      userId,
      url: feedUrl,
      title,
      siteUrl: outcome.siteUrl,
      iconUrl: meta.iconUrl,
      articles: outcome.articles,
      now: Date.now(),
      ...outcome.validators,
    });
    if (stored === null) {
      // The Account was deleted while this add was fetching: nothing was stored, and no one is left
      // to tell, so the reason is a placeholder no one sees.
      return { ok: false, reason: 'unreachable' };
    }
    return stored.added ? { ok: true, feedId: stored.feedId } : { ok: false, reason: 'already-added', title: stored.title, feedId: stored.feedId };
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

/**
 * When All was last brought up to date: the newest fetch across the signed-in User's Feeds, for
 * the "Updated 5 min ago" line under the Feeds title (FEE-47). Null with no Feeds, or none
 * fetched yet. It reads the schedules, so it re-runs on each check, and only it does (FEE-54).
 */
export const lastUpdated = query({
  args: {},
  returns: v.union(v.null(), v.number()),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const schedules = await ctx.db
      .query('feedSchedules')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(CHIP_LIMIT);
    const fetched = schedules.map((schedule) => schedule.lastFetchedAt ?? 0);
    const newest = Math.max(0, ...fetched);
    return newest > 0 ? newest : null;
  },
});

/** A User's Feeds that weren't fetched in the last couple of minutes. */
export const toRefresh = internalQuery({
  args: { userId: v.id('users'), now: v.number() },
  returns: v.array(v.id('feeds')),
  handler: async (ctx, { userId, now }) => {
    const schedules = await ctx.db
      .query('feedSchedules')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(PULL_LIMIT);
    return schedules.filter((schedule) => (schedule.lastFetchedAt ?? 0) <= now - PULL_GAP).map((schedule) => schedule.feedId);
  },
});

/**
 * Saves a newly fetched Feed and its Articles, unless the User already follows it (checked again
 * here, in case two adds raced). Returns the Feed followed at this URL, by name and id, with `added`
 * true when this call created it; null when the Account was deleted mid-add, and nothing was stored.
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
  // The Feed now followed at this URL: `added` when this call created it. Null when the Account is gone.
  returns: v.union(v.null(), v.object({ title: v.string(), feedId: v.id('feeds'), added: v.boolean() })),
  handler: async (ctx, { userId, url, title, siteUrl, iconUrl, articles, now, etag, lastModified }) => {
    const existing = await ctx.db
      .query('feeds')
      .withIndex('by_user_url', (q) => q.eq('userId', userId).eq('url', url))
      .first();
    if (existing) return { title: existing.title, feedId: existing._id, added: false };
    // The Account was deleted while this add was fetching: store nothing for it (P18, Q28).
    if ((await ctx.db.get(userId)) === null) return null;
    const feedId = await ctx.db.insert('feeds', { userId, url, title, siteUrl, iconUrl });
    await storeNewArticles(ctx, userId, feedId, articles, now);
    await markWorking(ctx, feedId, now, { etag, lastModified });
    return { title, feedId, added: true };
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
export function pinnedFeeds(ctx: QueryCtx, userId: Id<'users'>) {
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

/** A Pin refused: a fourth Pin (P9), or a Feed that isn't the User's. */
const vPinRefused = v.object({ ok: v.literal(false), reason: v.union(v.literal('pins-full'), v.literal('not-found')) });

/**
 * Pins or unpins one of the signed-in User's Feeds (P9). A fourth Pin is refused. Unpinning says
 * where the Feed was among the Pins (`place`, from 0), so Undo can put it back there (Q35).
 */
export const setPinned = mutation({
  args: { id: v.string(), pinned: v.boolean() },
  returns: v.union(
    v.object({ ok: v.literal(true), place: v.optional(v.number()) }),
    vPinRefused,
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const feed = await ownFeed(ctx, userId, args.id);
    if (!feed) return { ok: false as const, reason: 'not-found' as const };
    if (!args.pinned) {
      if (feed.pinOrder === undefined) return { ok: true as const };
      const place = (await pinnedFeeds(ctx, userId)).findIndex((f) => f._id === feed._id);
      await ctx.db.patch(feed._id, { pinOrder: undefined });
      // Past the Pin index's first few only with old, bad data: then there's no place to report.
      return place >= 0 ? { ok: true as const, place } : { ok: true as const };
    }
    if (feed.pinOrder !== undefined) return { ok: true as const };
    const pins = (await pinnedFeeds(ctx, userId)).map((f) => f.pinOrder ?? 0);
    if (pins.length >= MAX_PINS) return { ok: false as const, reason: 'pins-full' as const };
    await ctx.db.patch(feed._id, { pinOrder: Math.max(0, ...pins) + 1 });
    return { ok: true as const };
  },
});

/**
 * Undo for Unpin (Q35): Pins a Feed again at `place` among the Pins (from 0), as near as the Pins
 * now allow, and renumbers them in that order. With no place, or one that's no place, it goes last;
 * a Feed already Pinned stays put; a fourth Pin is still refused (P9). It's Pinning at a position,
 * so it gives nothing `setPinned` and `orderPins` don't already.
 */
export const restorePin = mutation({
  args: { id: v.string(), place: v.optional(v.number()) },
  returns: v.union(v.object({ ok: v.literal(true) }), vPinRefused),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const feed = await ownFeed(ctx, userId, args.id);
    if (!feed) return { ok: false as const, reason: 'not-found' as const };
    if (feed.pinOrder !== undefined) return { ok: true as const };
    const pinned = await pinnedFeeds(ctx, userId);
    if (pinned.length >= MAX_PINS) return { ok: false as const, reason: 'pins-full' as const };
    const asked = args.place;
    const place = asked !== undefined && Number.isInteger(asked) && asked >= 0 ? Math.min(asked, pinned.length) : pinned.length;
    const order = pinned.map((f) => f._id).toSpliced(place, 0, feed._id);
    await Promise.all(order.map((id, i) => ctx.db.patch(id, { pinOrder: i + 1 })));
    return { ok: true as const };
  },
});

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
        host: hostOf(feed),
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
    if (!title || title.length > MAX_FEED_NAME) return { ok: false as const, reason: 'invalid-name' as const };
    await ctx.db.patch(feed._id, { title });
    return { ok: true as const };
  },
});

/**
 * Removes one of the signed-in User's Feeds and its Articles, except those Saved (T23). The Feed
 * goes at once; its other Articles follow in batches, and All never shows them meanwhile.
 */
export const remove = mutation({
  args: { id: v.string() },
  returns: v.union(v.object({ ok: v.literal(true) }), v.object({ ok: v.literal(false), reason: v.literal('not-found') })),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const feed = await ownFeed(ctx, userId, args.id);
    if (!feed) return { ok: false as const, reason: 'not-found' as const };
    const schedule = await scheduleOf(ctx, feed._id);
    if (schedule) await ctx.db.delete(schedule._id);
    // Saved Articles stay, still named by the Feed (T23): the first page now, any more after.
    const named = await nameSavedPage(ctx, feed._id, feed.title, null);
    if (!named.isDone) {
      await ctx.scheduler.runAfter(0, internal.feeds.nameSaved, { feedId: feed._id, feedTitle: feed.title, cursor: named.continueCursor });
    }
    await ctx.db.delete(feed._id);
    await ctx.scheduler.runAfter(0, internal.feeds.removeArticles, { feedId: feed._id });
    return { ok: true as const };
  },
});

/** Gives one page of a removed Feed's Saved Articles the Feed's name to keep (T23). */
async function nameSavedPage(ctx: MutationCtx, feedId: Id<'feeds'>, feedTitle: string, cursor: string | null) {
  const page = await ctx.db
    .query('articles')
    .withIndex('by_feed_saved', (q) => q.eq('feedId', feedId).gt('savedAt', 0))
    .paginate({ numItems: DELETE_BATCH, cursor });
  await Promise.all(page.page.map((article) => ctx.db.patch(article._id, { feedTitle })));
  return page;
}

/** Names the rest of a removed Feed's Saved Articles, a page at a time, so no removal is too big for one transaction. */
export const nameSaved = internalMutation({
  args: { feedId: v.id('feeds'), feedTitle: v.string(), cursor: v.string() },
  returns: v.null(),
  handler: async (ctx, { feedId, feedTitle, cursor }) => {
    const named = await nameSavedPage(ctx, feedId, feedTitle, cursor);
    if (!named.isDone) await ctx.scheduler.runAfter(0, internal.feeds.nameSaved, { feedId, feedTitle, cursor: named.continueCursor });
    return null;
  },
});

/**
 * Deletes a removed Feed's Articles and their bodies, a batch at a time. Saved ones stay in Saved
 * until Done (T23); `remove` already gave them the Feed's name to keep.
 */
export const removeArticles = internalMutation({
  args: { feedId: v.id('feeds') },
  returns: v.null(),
  handler: async (ctx, { feedId }) => {
    const articles = await ctx.db
      .query('articles')
      .withIndex('by_feed_saved', (q) => q.eq('feedId', feedId).eq('savedAt', undefined))
      .take(DELETE_BATCH);
    await deleteArticles(ctx, articles);
    if (articles.length === DELETE_BATCH) await ctx.scheduler.runAfter(0, internal.feeds.removeArticles, { feedId });
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
