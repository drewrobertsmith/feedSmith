import type { Id } from '../../_generated/dataModel';
import type { MutationCtx } from '../../_generated/server';
import type { Validators } from './http';
import { backoff, nextCheckIn, PACE_WINDOW } from './pace';
import type { StoredArticle } from './validators';

/** Articles that aren't Saved are kept this long after publication (P14). */
export const RETENTION = 30 * 24 * 60 * 60_000;
/** Enough of a Feed's recent Articles to judge its pace; busier Feeds sit at the floor anyway. */
const PACE_SAMPLE = 2000;

/** Stores the Articles the Feed doesn't have yet, by guid, skipping any already past retention. */
export async function storeNewArticles(
  ctx: MutationCtx,
  userId: Id<'users'>,
  feedId: Id<'feeds'>,
  articles: StoredArticle[],
  now: number,
) {
  await Promise.all(
    articles.map(async ({ blocks, omitted, ...fields }) => {
      if (fields.publishedAt < now - RETENTION) return;
      const existing = await ctx.db
        .query('articles')
        .withIndex('by_feed_guid', (q) => q.eq('feedId', feedId).eq('guid', fields.guid))
        .first();
      if (existing) return;
      const articleId = await ctx.db.insert('articles', { userId, feedId, ...fields });
      await ctx.db.insert('articleBodies', { userId, articleId, blocks, omitted });
    }),
  );
}

/** Marks a Feed working and sets its next check from its pace (T19). */
export async function markWorking(ctx: MutationCtx, feedId: Id<'feeds'>, now: number, validators?: Validators) {
  const recent = await ctx.db
    .query('articles')
    .withIndex('by_feed_published', (q) => q.eq('feedId', feedId).gt('publishedAt', now - PACE_WINDOW))
    .take(PACE_SAMPLE);
  await ctx.db.patch(feedId, {
    status: 'working',
    failures: 0,
    lastFetchedAt: now,
    nextFetchAt: now + nextCheckIn(recent.map((a) => a.publishedAt), now),
    ...(validators ? { etag: validators.etag, lastModified: validators.lastModified } : {}),
  });
}

/** Marks a Feed failing and backs its next try off (Q7). Its Articles stay. */
export async function markFailing(ctx: MutationCtx, feedId: Id<'feeds'>, now: number) {
  const feed = await ctx.db.get(feedId);
  if (!feed) return;
  const failures = (feed.failures ?? 0) + 1;
  await ctx.db.patch(feedId, { status: 'failing', failures, lastFetchedAt: now, nextFetchAt: now + backoff(failures) });
}
