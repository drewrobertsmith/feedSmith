import { internal } from '../../_generated/api';
import type { Doc, Id } from '../../_generated/dataModel';
import type { MutationCtx, QueryCtx } from '../../_generated/server';
import type { Validators } from './http';
import { backoff, nextCheckIn, PACE_WINDOW } from './pace';
import { bringFetchForward } from './timer';
import type { FetchFailure, StoredArticle } from './validators';

/** Articles that aren't Saved are kept this long after publication (P14)... */
export const RETENTION = 30 * 24 * 60 * 60_000;
/** ...except each Feed's newest few, whatever their age, so a rare writer's page is never empty (FEE-93). */
export const KEEP_NEWEST = 5;
/** Enough of a Feed's recent Articles to judge its pace; busier Feeds sit at the floor anyway. */
const PACE_SAMPLE = 700;

/**
 * Stores the Articles the Feed doesn't have yet, by guid. One past retention is stored only when it's
 * among this fetch's `KEEP_NEWEST` newest, so a Feed that rarely posts still shows its last posts (FEE-93).
 * Expects each guid once in `articles` (`articlesToStore` guarantees it): the check is against
 * what's already stored, not within the batch. When any new one is summary only, its Feed's
 * pages are read next (T8).
 */
export async function storeNewArticles(
  ctx: MutationCtx,
  userId: Id<'users'>,
  feedId: Id<'feeds'>,
  articles: StoredArticle[],
  now: number,
) {
  // One run reads a Feed's pages at a time: one already going picks up what's stored now (T24).
  // Checked before storing, on purpose: the Articles about to be stored would otherwise count themselves.
  const reading = await Promise.all(
    (['pending', 'reading'] as const).map((state) =>
      ctx.db
        .query('pageReads')
        .withIndex('by_feed_state', (q) => q.eq('feedId', feedId).eq('state', state))
        .first(),
    ),
  );
  const newest = new Set(
    [...articles]
      .sort((x, y) => y.publishedAt - x.publishedAt)
      .slice(0, KEEP_NEWEST)
      .map((article) => article.guid),
  );
  const stored = await Promise.all(
    articles.map(async ({ blocks, omitted, extraction, ...fields }) => {
      if (fields.publishedAt < now - RETENTION && !newest.has(fields.guid)) return false;
      const existing = await ctx.db
        .query('articles')
        .withIndex('by_feed_guid', (q) => q.eq('feedId', feedId).eq('guid', fields.guid))
        .first();
      if (existing) {
        // Stored before lead images or authors were kept: fill them in, and nothing else changes.
        const backfill = {
          ...(!existing.imageUrl && fields.imageUrl ? { imageUrl: fields.imageUrl } : {}),
          ...(!existing.authors && fields.authors ? { authors: fields.authors } : {}),
        };
        if (Object.keys(backfill).length > 0) await ctx.db.patch(existing._id, backfill);
        return false;
      }
      const articleId = await ctx.db.insert('articles', { userId, feedId, ...fields });
      await ctx.db.insert('articleBodies', { userId, articleId, blocks, omitted });
      if (extraction !== 'pending') return false;
      // Its page is read later, tracked apart from the Article so All doesn't re-run meanwhile (FEE-62).
      await ctx.db.insert('pageReads', { articleId, feedId, userId, state: 'pending' });
      return true;
    }),
  );
  if (stored.some(Boolean) && !reading.some(Boolean)) await ctx.scheduler.runAfter(0, internal.extractPages.run, { feedId });
}

/** A Feed's fetch schedule (FEE-54), or null for a Feed stored before schedules existed. */
export function scheduleOf(ctx: QueryCtx, feedId: Id<'feeds'>) {
  return ctx.db
    .query('feedSchedules')
    .withIndex('by_feed', (q) => q.eq('feedId', feedId))
    .unique();
}

type ScheduleFields = Omit<Doc<'feedSchedules'>, '_id' | '_creationTime' | 'feedId' | 'userId'>;

/** Writes a Feed's schedule, creating it the first time. */
async function writeSchedule(ctx: MutationCtx, feed: Doc<'feeds'>, schedule: Doc<'feedSchedules'> | null, fields: ScheduleFields) {
  if (schedule) await ctx.db.patch(schedule._id, fields);
  else await ctx.db.insert('feedSchedules', { feedId: feed._id, userId: feed.userId, ...fields });
  // A Feed now due sooner than the scheduler's next run brings that run forward (FEE-55).
  await bringFetchForward(ctx, fields.nextFetchAt);
}

/**
 * Sets whether a Feed works (P15), and since when and why it fails (FEE-126), only when that changes: the
 * screens read the Feed. The first failure sets since when; later ones keep it and update why.
 */
async function setHealth(ctx: MutationCtx, feed: Doc<'feeds'>, health: { failing: false } | { failing: true; now: number; reason: FetchFailure }) {
  const next = health.failing
    ? { status: 'failing' as const, failingSince: feed.failingSince ?? health.now, failure: health.reason }
    : { status: 'working' as const, failingSince: undefined, failure: undefined };
  if (feed.status !== next.status || feed.failingSince !== next.failingSince || feed.failure !== next.failure) {
    await ctx.db.patch(feed._id, next);
  }
}

/**
 * Marks a Feed working and sets its next check from its pace (T19). Callers check first that no
 * newer fetch has finished (`recordFetch`, `recordNotModified`), so an older result never wins.
 */
export async function markWorking(ctx: MutationCtx, feedId: Id<'feeds'>, now: number, validators?: Validators) {
  const feed = await ctx.db.get(feedId);
  if (!feed) return;
  const recent = await ctx.db
    .query('articles')
    .withIndex('by_feed_published', (q) => q.eq('feedId', feedId).gte('publishedAt', now - PACE_WINDOW))
    .take(PACE_SAMPLE);
  const schedule = await scheduleOf(ctx, feedId);
  await writeSchedule(ctx, feed, schedule, {
    failures: 0,
    lastFetchedAt: now,
    nextFetchAt: now + nextCheckIn(recent.map((a) => a.publishedAt), now),
    // A 304 brings no new validators: the ones the Feed gave last time still stand.
    etag: validators ? validators.etag : schedule?.etag,
    lastModified: validators ? validators.lastModified : schedule?.lastModified,
  });
  await setHealth(ctx, feed, { failing: false });
}

/** Marks a Feed failing and backs its next try off (Q7). Its Articles stay. */
export async function markFailing(ctx: MutationCtx, feedId: Id<'feeds'>, now: number, reason: FetchFailure) {
  const feed = await ctx.db.get(feedId);
  if (!feed) return;
  const schedule = await scheduleOf(ctx, feedId);
  // A newer fetch already finished: an older failure never overwrites it.
  if ((schedule?.lastFetchedAt ?? 0) > now) return;
  const failures = (schedule?.failures ?? 0) + 1;
  await writeSchedule(ctx, feed, schedule, {
    failures,
    lastFetchedAt: now,
    nextFetchAt: now + backoff(failures),
    etag: schedule?.etag,
    lastModified: schedule?.lastModified,
  });
  await setHealth(ctx, feed, { failing: true, now, reason });
}
