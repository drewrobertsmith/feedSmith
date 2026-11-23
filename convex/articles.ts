import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { mutation, query, type QueryCtx } from './_generated/server';
import { requireUserId } from './lib/currentUser';
import { ownFeed, pinnedFeeds } from './feeds';
import { PINNED } from './lib/pinned';
import { faviconOf } from './lib/feed/face';
import { type ReadingPage, vBlock, vOmittedKind, vReadingPage } from './lib/feed/validators';

/** All shows a User's newest Articles, up to this many: the scrolling budget's 300 (FEE-27). */
const ALL_LIMIT = 300;

type FeedFace = { title: string; faviconUrl?: string };

/** Each Feed's name and favicon. The favicon comes from its site, never its secret URL (Q9). */
async function feedFaces(ctx: QueryCtx, feedIds: Id<'feeds'>[]) {
  const ids = [...new Set(feedIds)];
  const feeds = await Promise.all(ids.map((id) => ctx.db.get(id)));
  return new Map<Id<'feeds'>, FeedFace>(
    // A Feed that's gone has no face.
    ids.flatMap((id, i) => {
      const feed = feeds[i];
      if (!feed) return [];
      const face: FeedFace = { title: feed.title };
      const faviconUrl = faviconOf(feed);
      if (faviconUrl) face.faviconUrl = faviconUrl;
      return [[id, face] as const];
    }),
  );
}

/** One Article in a list: All, a Feed's, or Saved. Never a feed URL (Q9). */
const vRow = v.object({
  id: v.id('articles'),
  /** Absent for a Saved Article whose Feed was removed (T23). */
  feedId: v.optional(v.id('feeds')),
  title: v.string(),
  subtitle: v.optional(v.string()),
  imageUrl: v.optional(v.string()),
  authors: v.optional(v.array(v.string())),
  feedTitle: v.string(),
  faviconUrl: v.optional(v.string()),
  publishedAt: v.number(),
  read: v.boolean(),
  saved: v.boolean(),
});

/** An Article as a list row, named by its Feed, or by the name it kept when its Feed went (T23). */
function rowOf(article: Doc<'articles'>, face: FeedFace | undefined) {
  return {
    id: article._id,
    ...(face ? { feedId: article.feedId } : {}),
    title: article.title,
    subtitle: article.subtitle,
    imageUrl: article.imageUrl,
    authors: article.authors,
    feedTitle: face?.title ?? article.feedTitle ?? '',
    faviconUrl: face?.faviconUrl,
    publishedAt: article.publishedAt,
    read: article.readAt !== undefined,
    saved: article.savedAt !== undefined,
  };
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
 * Feed's (P5); with `PINNED`, the Pinned Feeds' Articles interleaved, as All interleaves every Feed
 * (FEE-59). The id may come from a link, so any string is checked here (Q25). Never a feed URL (Q9).
 */
export const all = query({
  args: { feedId: v.optional(v.string()) },
  returns: v.array(vRow),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    let articles;
    if (args.feedId === PINNED) {
      // At most three Pinned Feeds (P9): each one's newest, merged, newest first, under All's limit.
      const pins = await pinnedFeeds(ctx, userId);
      const each = await Promise.all(
        pins.map((feed) =>
          ctx.db
            .query('articles')
            .withIndex('by_feed_published', (q) => q.eq('feedId', feed._id))
            .order('desc')
            .take(ALL_LIMIT),
        ),
      );
      articles = each
        .flat()
        .sort((a, b) => b.publishedAt - a.publishedAt)
        .slice(0, ALL_LIMIT);
    } else if (args.feedId === undefined) {
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
    // A removed Feed's Articles are deleted in batches after it; they're never shown meanwhile.
    return articles.filter((a) => faces.has(a.feedId)).map((a) => rowOf(a, faces.get(a.feedId)));
  },
});

/**
 * Saved: the signed-in User's Saved Articles, most recently Saved first (P14), including those
 * whose Feed was removed, named by the Feed they came from (T23). Saved holds only what you still
 * mean to read (P8), so it's read whole.
 */
export const saved = query({
  args: {},
  returns: v.array(vRow),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const articles = await ctx.db
      .query('articles')
      .withIndex('by_user_saved', (q) => q.eq('userId', userId).gt('savedAt', 0))
      .order('desc')
      .collect();
    const faces = await feedFaces(ctx, articles.map((a) => a.feedId));
    return articles.map((a) => rowOf(a, faces.get(a.feedId)));
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
      /** Its Feed, so the Reading view's Feed name links to it (FEE-47); absent once removed (T23). */
      feedId: v.optional(v.id('feeds')),
      feedTitle: v.string(),
      publishedAt: v.number(),
      link: v.optional(v.string()),
      subtitle: v.optional(v.string()),
      imageUrl: v.optional(v.string()),
      authors: v.optional(v.array(v.string())),
      blocks: v.array(vBlock),
      omitted: v.array(vOmittedKind),
      /** Summary only: its page is still being read, or couldn't be (T8, Q6). Absent once the text is whole. */
      page: v.optional(vReadingPage),
      saved: v.boolean(),
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
    // A removed Feed's Articles are on their way out, except those Saved (T23); a link to one opens nothing.
    if (!feed && article.savedAt === undefined) return null;
    const read = await ctx.db
      .query('pageReads')
      .withIndex('by_article', (q) => q.eq('articleId', article._id))
      .unique();
    const page = pageOf(read?.state);
    return {
      title: article.title,
      ...(feed ? { feedId: feed._id } : {}),
      feedTitle: feed?.title ?? article.feedTitle ?? '',
      publishedAt: article.publishedAt,
      link: article.link,
      subtitle: article.subtitle,
      imageUrl: article.imageUrl,
      authors: article.authors,
      blocks: body?.blocks ?? [],
      omitted: body?.omitted ?? [],
      ...(page ? { page } : {}),
      saved: article.savedAt !== undefined,
    };
  },
});

/** What the Reading view is told about an Article's page: nothing once its text is whole (T8). */
function pageOf(state: 'pending' | 'reading' | 'failed' | undefined): ReadingPage | undefined {
  if (state === 'pending' || state === 'reading') return 'extracting';
  if (state === 'failed') return 'unavailable';
  return undefined;
}

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

/**
 * Whether an Article can be (or go back to being) Saved: its Feed is still there, or it already
 * kept the Feed's name when the Feed was removed (T23). An Article of a Feed being removed is on its
 * way out, and Saved would have nothing to call it.
 */
async function canBeSaved(ctx: QueryCtx, article: Doc<'articles'>) {
  return article.savedAt !== undefined || article.feedTitle !== undefined || (await ctx.db.get(article.feedId)) !== null;
}

/** What an Article's Saved and Read state was before a change, for Undo to put back (Q35). */
const vBefore = v.object({ savedAt: v.optional(v.number()), readAt: v.optional(v.number()) });
const beforeOf = (article: Doc<'articles'>) => ({ savedAt: article.savedAt, readAt: article.readAt });

/**
 * Saves one of the User's Articles (Q3): it goes to the top of Saved. One already Saved keeps its
 * place. Returns what it was before, for Undo; null when the id names none of the User's Articles.
 */
export const save = mutation({
  args: { id: v.string() },
  returns: v.union(v.null(), vBefore),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const article = await ownArticle(ctx, userId, args.id);
    if (!article || !(await canBeSaved(ctx, article))) return null;
    if (article.savedAt === undefined) await ctx.db.patch(article._id, { savedAt: Date.now() });
    return beforeOf(article);
  },
});

/**
 * Marks one of the User's Saved Articles Done (P8): it leaves Saved and stays in its Feed as Read.
 * Returns what it was before, for Undo; null when the id names none of the User's Articles.
 */
export const done = mutation({
  args: { id: v.string() },
  returns: v.union(v.null(), vBefore),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const article = await ownArticle(ctx, userId, args.id);
    if (!article) return null;
    await ctx.db.patch(article._id, { savedAt: undefined, readAt: article.readAt ?? Date.now() });
    return beforeOf(article);
  },
});

/**
 * Undo (Q35): puts an Article's Saved and Read state back as `save` or `done` found it, so it
 * returns to its old place in Saved. Times never run ahead of now, and anything that isn't a time counts as none.
 */
export const restore = mutation({
  args: { id: v.string(), savedAt: v.optional(v.number()), readAt: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const article = await ownArticle(ctx, userId, args.id);
    if (!article) return null;
    const now = Date.now();
    // Only a real moment counts; anything else (NaN, zero, negative) means none.
    const at = (time: number | undefined) => (time !== undefined && Number.isFinite(time) && time > 0 ? Math.min(time, now) : undefined);
    const savedAt = at(args.savedAt);
    // Back into Saved only if Saved can still name it; its Read state goes back either way.
    const saveable = savedAt === undefined || (await canBeSaved(ctx, article));
    await ctx.db.patch(article._id, { savedAt: saveable ? savedAt : undefined, readAt: at(args.readAt) });
    return null;
  },
});
