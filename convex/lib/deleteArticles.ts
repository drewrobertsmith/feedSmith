import type { Doc } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';

/**
 * Deletes Articles and their bodies. The callers read one batch (`DELETE_BATCH`) at a time, so a
 * transaction stays inside Convex's limits however many Articles there are: removing a Feed, the
 * 30-day clean-up, and deleting an Account.
 */
export async function deleteArticles(ctx: MutationCtx, articles: Doc<'articles'>[]): Promise<void> {
  await Promise.all(
    articles.map(async (article) => {
      const bodies = await ctx.db
        .query('articleBodies')
        .withIndex('by_article', (q) => q.eq('articleId', article._id))
        .take(10);
      await Promise.all(bodies.map((body) => ctx.db.delete(body._id)));
      await ctx.db.delete(article._id);
    }),
  );
}
