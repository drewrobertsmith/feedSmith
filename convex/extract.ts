import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalAction, internalMutation, internalQuery } from './_generated/server';
import { fetchAndExtract, type ExtractOutcome } from './lib/feed/extract';
import { vExtractOutcome } from './lib/feed/validators';

/** Pages read per run, one after another, so a site is never hit all at once; a backlog continues in the next run. */
const PER_RUN = 5;

/** A Feed's Articles still waiting for their page to be read (T8). */
export const pending = internalQuery({
  args: { feedId: v.id('feeds') },
  returns: v.array(v.object({ articleId: v.id('articles'), link: v.string() })),
  handler: async (ctx, { feedId }) => {
    const articles = await ctx.db
      .query('articles')
      .withIndex('by_feed_extraction', (q) => q.eq('feedId', feedId).eq('extraction', 'pending'))
      .take(PER_RUN);
    return articles.flatMap((article) => (article.link ? [{ articleId: article._id, link: article.link }] : []));
  },
});

/**
 * Reads a Feed's summary-only Articles in full from their pages (T8, FEE-25), a few per run.
 * Each page is fetched under the fetch policy and cleaned like a Feed's own text (Q8); an
 * Article whose page can't be read keeps its Subtitle, and the Reading view falls back (Q6).
 */
export const run = internalAction({
  args: { feedId: v.id('feeds') },
  returns: v.null(),
  handler: async (ctx, { feedId }) => {
    const batch = await ctx.runQuery(internal.extract.pending, { feedId });
    for (const { articleId, link } of batch) {
      const outcome: ExtractOutcome = await fetchAndExtract(link);
      try {
        await ctx.runMutation(internal.extract.record, { articleId, outcome });
      } catch {
        // Too big to store, or anything else unexpected: the Article falls back rather than waiting forever.
        await ctx.runMutation(internal.extract.record, { articleId, outcome: { _tag: 'Failed' } });
      }
    }
    if (batch.length === PER_RUN) await ctx.scheduler.runAfter(0, internal.extract.run, { feedId });
    return null;
  },
});

/** Stores what reading an Article's page came to. An Article that's gone, or already read, is left alone. */
export const record = internalMutation({
  args: { articleId: v.id('articles'), outcome: vExtractOutcome },
  returns: v.null(),
  handler: async (ctx, { articleId, outcome }) => {
    const article = await ctx.db.get(articleId);
    if (!article || article.extraction !== 'pending') return null;
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
