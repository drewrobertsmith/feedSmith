import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import { mutation, query, type QueryCtx } from './_generated/server';
import { requireUserId } from './lib/currentUser';
import { ownFeed } from './feeds';
import { faviconOf } from './lib/feed/face';
import { vBlock, vOmittedKind } from './lib/feed/validators';

/** All shows a User's newest Articles, up to this many: the scrolling budget's 300 (FEE-27). */
const ALL_LIMIT = 300;

type FeedFace = { title: string; faviconUrl?: string };

/** Each Feed's name and favicon. The favicon comes from its site, never its secret URL (Q9). */
async function feedFaces(ctx: QueryCtx, feedIds: Id<'feeds'>[]) {
  const ids = [...new Set(feedIds)];
  const feeds = await Promise.all(ids.map((id) => ctx.db.get(id)));
  return new Map<Id<'feeds'>, FeedFace>(
    ids.map((id, i) => {
      const feed = feeds[i];
      const face: FeedFace = { title: feed?.title ?? '' };
      const faviconUrl = feed ? faviconOf(feed) : undefined;
      if (faviconUrl) face.faviconUrl = faviconUrl;
      return [id, face];
    }),
  );
}

/** A link's id as one of the signed-in User's Articles, or null (Q25). */
async function ownArticle(ctx: QueryCtx, userId: Id<'users'>, rawId: string) {
  // Convex ids are well under 64 characters; longer strings aren't worth normalising.
  const id = rawId.length <= 64 ? ctx.db.normalizeId('articles', rawId) : null;
  const article = id ? await ctx.db.get(id) : null;
  return article && article.userId === userId ? article : null;
}

/**
 * All: every Article from the signed-in User's Feeds, newest first; with `feedId`, only that
 * Feed's (P5). The id may come from a link, so any string is checked here (Q25). Never a feed URL (Q9).
 */
export const all = query({
  args: { feedId: v.optional(v.string()) },
  returns: v.array(
    v.object({
      id: v.id('articles'),
      feedId: v.id('feeds'),
      title: v.string(),
      subtitle: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      feedTitle: v.string(),
      faviconUrl: v.optional(v.string()),
      publishedAt: v.number(),
      read: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    let articles;
    if (args.feedId === undefined) {
      articles = await ctx.db
        .query('articles')
        .withIndex('by_user_published', (q) => q.eq('userId', userId))
        .order('desc')
        .take(ALL_LIMIT);
    } else {
      const feed = await ownFeed(ctx, userId, args.feedId);
      if (!feed) return [];
      articles = await ctx.db
        .query('articles')
        .withIndex('by_feed_published', (q) => q.eq('feedId', feed._id))
        .order('desc')
        .take(ALL_LIMIT);
    }
    const faces = await feedFaces(ctx, articles.map((a) => a.feedId));
    return articles.map((a) => {
      const face = faces.get(a.feedId);
      return {
        id: a._id,
        feedId: a.feedId,
        title: a.title,
        subtitle: a.subtitle,
        imageUrl: a.imageUrl,
        feedTitle: face?.title ?? '',
        faviconUrl: face?.faviconUrl,
        publishedAt: a.publishedAt,
        read: a.readAt !== undefined,
      };
    });
  },
});

/**
 * One Article for the Reading view, or null when the id isn't one of the signed-in User's
 * Articles. The id comes from a link, so any string is accepted and checked here (Q25).
 */
export const get = query({
  args: { id: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      title: v.string(),
      feedTitle: v.string(),
      publishedAt: v.number(),
      link: v.optional(v.string()),
      blocks: v.array(vBlock),
      omitted: v.array(vOmittedKind),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const article = await ownArticle(ctx, userId, args.id);
    if (!article) return null;
    const [feed, body] = await Promise.all([
      ctx.db.get(article.feedId),
      ctx.db
        .query('articleBodies')
        .withIndex('by_article', (q) => q.eq('articleId', article._id))
        .unique(),
    ]);
    return {
      title: article.title,
      feedTitle: feed?.title ?? '',
      publishedAt: article.publishedAt,
      link: article.link,
      blocks: body?.blocks ?? [],
      omitted: body?.omitted ?? [],
    };
  },
});

/** Opening an Article marks it Read (P7). Only the User's own; the first opening counts. */
export const markRead = mutation({
  args: { id: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const article = await ownArticle(ctx, userId, args.id);
    if (article && article.readAt === undefined) await ctx.db.patch(article._id, { readAt: Date.now() });
    return null;
  },
});
