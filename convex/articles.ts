import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import { query, type QueryCtx } from './_generated/server';
import { requireUserId } from './lib/currentUser';
import { vBlock, vOmittedKind } from './lib/feed/validators';

/** All shows a User's newest Articles, up to this many. */
const ALL_LIMIT = 200;

async function feedTitles(ctx: QueryCtx, feedIds: Id<'feeds'>[]) {
  const ids = [...new Set(feedIds)];
  const feeds = await Promise.all(ids.map((id) => ctx.db.get(id)));
  return new Map(ids.map((id, i) => [id, feeds[i]?.title ?? ''] as const));
}

/** All: every Article from the signed-in User's Feeds, newest first. Never a feed URL (Q9). */
export const all = query({
  args: {},
  returns: v.array(
    v.object({ id: v.id('articles'), title: v.string(), feedTitle: v.string(), publishedAt: v.number() }),
  ),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const articles = await ctx.db
      .query('articles')
      .withIndex('by_user_published', (q) => q.eq('userId', userId))
      .order('desc')
      .take(ALL_LIMIT);
    const titles = await feedTitles(ctx, articles.map((a) => a.feedId));
    return articles.map((a) => ({
      id: a._id,
      title: a.title,
      feedTitle: titles.get(a.feedId) ?? '',
      publishedAt: a.publishedAt,
    }));
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
    // Convex ids are well under 64 characters; longer strings aren't worth normalising.
    const id = args.id.length <= 64 ? ctx.db.normalizeId('articles', args.id) : null;
    const article = id ? await ctx.db.get(id) : null;
    if (!article || article.userId !== userId) return null;
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
