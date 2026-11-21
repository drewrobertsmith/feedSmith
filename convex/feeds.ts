import { v } from 'convex/values';
import { Effect } from 'effect';

import { internal } from './_generated/api';
import { action, internalMutation, internalQuery } from './_generated/server';
import { requireUserId } from './lib/currentUser';
import { FeedHttp, safeUrl } from './lib/feed/http';
import { parseFeed } from './lib/feed/parse';
import { articlesToStore } from './lib/feed/store';
import { vAddFeedReason, vBlock, vOmittedKind, type AddFeedReason } from './lib/feed/validators';

const MAX_URL = 2048;

const REASONS = {
  InvalidUrl: 'invalid-url',
  Unreachable: 'unreachable',
  Timeout: 'timeout',
  TooLarge: 'too-large',
  NotAFeed: 'not-a-feed',
} as const satisfies Record<string, AddFeedReason>;

const vAddResult = v.union(
  v.object({ ok: v.literal(true) }),
  v.object({ ok: v.literal(false), reason: vAddFeedReason }),
);
type AddResult = { ok: true } | { ok: false; reason: AddFeedReason };

const vStoredArticle = v.object({
  guid: v.string(),
  title: v.string(),
  link: v.optional(v.string()),
  subtitle: v.optional(v.string()),
  publishedAt: v.number(),
  blocks: v.array(vBlock),
  omitted: v.array(vOmittedKind),
});

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
    const feedUrl = url.length <= MAX_URL ? safeUrl(url)?.href : undefined;
    if (!feedUrl) return { ok: false, reason: 'invalid-url' };

    const fetched = await Effect.runPromise(
      Effect.gen(function* () {
        const http = yield* FeedHttp;
        const body = yield* http.get(feedUrl);
        return yield* parseFeed(body, Date.now());
      }).pipe(
        Effect.provide(FeedHttp.layer),
        Effect.match({
          onFailure: (error) => ({ ok: false as const, reason: REASONS[error._tag] }),
          onSuccess: (feed) => ({ ok: true as const, feed }),
        }),
      ),
    );
    if (!fetched.ok) return fetched;

    const stored = await ctx.runMutation(internal.feeds.store, {
      userId,
      url: feedUrl,
      title: fetched.feed.title,
      articles: articlesToStore(fetched.feed.articles),
    });
    return stored === 'stored' ? { ok: true as const } : { ok: false as const, reason: stored };
  },
});

/** The signed-in User, for actions; refuses a signed-out caller (Q10). */
export const viewer = internalQuery({
  args: {},
  returns: v.id('users'),
  handler: (ctx) => requireUserId(ctx),
});

/** Saves a fetched Feed and its Articles, unless the User already follows it. */
export const store = internalMutation({
  args: { userId: v.id('users'), url: v.string(), title: v.string(), articles: v.array(vStoredArticle) },
  returns: v.union(v.literal('stored'), v.literal('already-added')),
  handler: async (ctx, { userId, url, title, articles }) => {
    const existing = await ctx.db
      .query('feeds')
      .withIndex('by_user_url', (q) => q.eq('userId', userId).eq('url', url))
      .first();
    if (existing) return 'already-added' as const;
    const feedId = await ctx.db.insert('feeds', { userId, url, title });
    await Promise.all(
      articles.map(async ({ blocks, omitted, ...fields }) => {
        const articleId = await ctx.db.insert('articles', { userId, feedId, ...fields });
        await ctx.db.insert('articleBodies', { userId, articleId, blocks, omitted });
      }),
    );
    return 'stored' as const;
  },
});
