import { v } from 'convex/values';

import { internal } from './_generated/api';
import { action, internalMutation, internalQuery } from './_generated/server';
import { requireUserId } from './lib/currentUser';
import { findFeedLinks, siteMeta, type FeedLink, type SiteMeta } from './lib/feed/discover';
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
);
type AddResult = { ok: true } | { ok: false; reason: AddFeedReason } | { ok: false; reason: 'choose'; choices: FeedLink[] };

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
      outcome = await fetchFeed(feedUrl);
    }
    if (outcome._tag === 'Failed') return { ok: false, reason: outcome.reason };
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
    return stored === 'stored' ? { ok: true } : { ok: false, reason: stored };
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

/** Saves a newly fetched Feed and its Articles, unless the User already follows it. */
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
  returns: v.union(v.literal('stored'), v.literal('already-added')),
  handler: async (ctx, { userId, url, title, siteUrl, iconUrl, articles, now, etag, lastModified }) => {
    const existing = await ctx.db
      .query('feeds')
      .withIndex('by_user_url', (q) => q.eq('userId', userId).eq('url', url))
      .first();
    if (existing) return 'already-added' as const;
    const feedId = await ctx.db.insert('feeds', { userId, url, title, siteUrl, iconUrl });
    await storeNewArticles(ctx, userId, feedId, articles, now);
    await markWorking(ctx, feedId, now, { etag, lastModified });
    return 'stored' as const;
  },
});
