import { v } from 'convex/values';
import { Effect } from 'effect';

import { internal } from './_generated/api';
import { action, internalMutation, internalQuery } from './_generated/server';
import { requireUserId } from './lib/currentUser';
import { htmlToBlocks, type Block } from './lib/feed/blocks';
import { FeedHttp } from './lib/feed/http';
import { parseFeed, type ParsedArticle } from './lib/feed/parse';
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

/** An Article's content: the Feed's full text when it has it (T8), else its Subtitle. */
function content(article: ParsedArticle) {
  const base = article.link ?? 'https://invalid.invalid/';
  if (article.html) return htmlToBlocks(article.html, base);
  const blocks: Block[] = article.subtitle ? [{ type: 'paragraph', spans: [{ text: article.subtitle }] }] : [];
  return { blocks, omitted: [] };
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
    if (url.length > MAX_URL) return { ok: false as const, reason: 'invalid-url' as const };

    const fetched = await Effect.runPromise(
      Effect.gen(function* () {
        const http = yield* FeedHttp;
        const body = yield* http.get(url);
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

    const articles = fetched.feed.articles.map((article) => {
      const { html: _html, ...fields } = article;
      return { ...fields, ...content(article) };
    });
    const stored = await ctx.runMutation(internal.feeds.store, {
      userId,
      url: url.trim(),
      title: fetched.feed.title,
      articles,
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
    await Promise.all(articles.map((article) => ctx.db.insert('articles', { userId, feedId, ...article })));
    return 'stored' as const;
  },
});
