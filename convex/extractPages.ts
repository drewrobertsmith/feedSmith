'use node';

import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalAction } from './_generated/server';
import { fetchAndExtract, type ExtractOutcome } from './lib/feed/extract';

/**
 * Reads a Feed's summary-only Articles in full from their pages (T8, T24), a few per run, one
 * page at a time. Each page is fetched under the fetch policy and cleaned like a Feed's own text
 * (Q8); an Article whose page can't be read keeps its Subtitle, and the Reading view falls back
 * (Q6). Runs in Node, which has room to parse a page of up to 2 MB into a document.
 */
export const run = internalAction({
  args: { feedId: v.id('feeds') },
  returns: v.null(),
  handler: async (ctx, { feedId }) => {
    const batch = await ctx.runQuery(internal.extract.pending, { feedId });
    for (const { articleId, link } of batch) {
      if (!(await ctx.runMutation(internal.extract.claim, { articleId }))) continue;
      let outcome: ExtractOutcome = { _tag: 'Failed' };
      try {
        if (link) outcome = await fetchAndExtract(link);
      } catch {
        // A defect while reading one page costs only that Article.
      }
      try {
        await ctx.runMutation(internal.extract.record, { articleId, outcome });
      } catch (error) {
        // Too big to store, or anything else unexpected: the Article falls back rather than waiting
        // forever. Logged by its id only; an Article's page link isn't a secret, but nothing else is needed.
        console.warn('extract: storing failed, falling back', articleId, String(error).slice(0, 200));
        await ctx.runMutation(internal.extract.record, { articleId, outcome: { _tag: 'Failed' } });
      }
    }
    // Keep going while anything's waiting, including Articles stored while this run read.
    if (batch.length > 0) await ctx.scheduler.runAfter(0, internal.extractPages.run, { feedId });
    return null;
  },
});
