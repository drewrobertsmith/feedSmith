import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalMutation, internalQuery } from './_generated/server';
import { vExtractOutcome } from './lib/feed/validators';

/** Pages read per run, one after another, so a site is never hit all at once; a backlog continues in the next run. */
export const PER_RUN = 5;
/** An Article claimed for reading this long ago, and still not stored, is given up on: the run died (T24). */
const READING_LEASE = 15 * 60_000;

/** A Feed's Articles still waiting for their page to be read (T8). None once the Feed is gone. */
export const pending = internalQuery({
  args: { feedId: v.id('feeds') },
  returns: v.array(v.object({ articleId: v.id('articles'), link: v.optional(v.string()) })),
  handler: async (ctx, { feedId }) => {
    if (!(await ctx.db.get(feedId))) return [];
    const articles = await ctx.db
      .query('articles')
      .withIndex('by_feed_extraction', (q) => q.eq('feedId', feedId).eq('extraction', 'pending'))
      .take(PER_RUN);
    return articles.map((article) => ({ articleId: article._id, link: article.link }));
  },
});

/**
 * Claims one Article for reading, so no other run reads its page too. If the claim isn't
 * settled in time (the run died mid-page), the Article falls back instead of waiting forever.
 * False when it's no longer waiting.
 */
export const claim = internalMutation({
  args: { articleId: v.id('articles') },
  returns: v.boolean(),
  handler: async (ctx, { articleId }) => {
    const article = await ctx.db.get(articleId);
    if (article?.extraction !== 'pending') return false;
    await ctx.db.patch(articleId, { extraction: 'reading' });
    await ctx.scheduler.runAfter(READING_LEASE, internal.extract.expire, { articleId });
    return true;
  },
});

/** Gives up on a claim that was never settled. */
export const expire = internalMutation({
  args: { articleId: v.id('articles') },
  returns: v.null(),
  handler: async (ctx, { articleId }) => {
    const article = await ctx.db.get(articleId);
    if (article?.extraction === 'reading') await ctx.db.patch(articleId, { extraction: 'failed' });
    return null;
  },
});

/** Stores what reading a claimed Article's page came to. An Article that's gone, or not claimed, is left alone. */
export const record = internalMutation({
  args: { articleId: v.id('articles'), outcome: vExtractOutcome },
  returns: v.null(),
  handler: async (ctx, { articleId, outcome }) => {
    const article = await ctx.db.get(articleId);
    if (article?.extraction !== 'reading') return null;
    if (outcome._tag === 'Extracted') {
      const body = await ctx.db
        .query('articleBodies')
        .withIndex('by_article', (q) => q.eq('articleId', articleId))
        .unique();
      if (body) await ctx.db.patch(body._id, { blocks: outcome.blocks, omitted: outcome.omitted });
    }
    // The page's own image stands in when the Feed gave none, for All and for the fallback.
    const image = !article.imageUrl && outcome.imageUrl ? { imageUrl: outcome.imageUrl } : {};
    await ctx.db.patch(articleId, { extraction: outcome._tag === 'Extracted' ? 'extracted' : 'failed', ...image });
    return null;
  },
});
