'use node';

import { v } from 'convex/values';

import { Cause, Effect } from 'effect';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalAction, type ActionCtx } from './_generated/server';
import { fetchAndExtractEffect, type ExtractOutcome } from './lib/feed/extract';
import { REASONS } from './lib/feed/fetch';
import { ServerLayer } from './lib/feed/server';

const FAILED: ExtractOutcome = { _tag: 'Failed' };

/** A page read's line: its outcome, by the Article's id (annotated by the caller), never its link (FEE-113). */
const logRead = (outcome: string) => Effect.logInfo('page read').pipe(Effect.annotateLogs({ outcome }));
/** A bug while reading or storing a page: logged as an error, its cause scrubbed of URLs (FEE-113). */
const logDefect = (stage: 'reading' | 'storing') => (defect: unknown) =>
  Effect.logError('defect while reading a page', Cause.die(defect)).pipe(Effect.annotateLogs({ stage }));

/**
 * Reads one Article's page and stores what it found. A page that can't be fetched or read falls
 * back, and so does a defect while reading it or storing it: a bug costs only that Article, which
 * falls back rather than waiting forever (FEE-110). Every line it logs carries the Article's id.
 */
const readPage = Effect.fn('readPage')(function* (ctx: ActionCtx, articleId: Id<'articles'>, link: string | undefined) {
  const outcome = link
    ? yield* fetchAndExtractEffect(link).pipe(
        Effect.tap((read) => logRead(read._tag === 'Extracted' ? 'extracted' : 'fell-back')),
        Effect.catch((error) => logRead(REASONS[error._tag]).pipe(Effect.as(FAILED))),
        Effect.catchDefect((defect) => logDefect('reading')(defect).pipe(Effect.as(FAILED))),
      )
    : yield* logRead('no-link').pipe(Effect.as(FAILED));
  yield* Effect.promise(() => ctx.runMutation(internal.extract.record, { articleId, outcome })).pipe(
    // Too big to store, or anything else unexpected: the Article falls back rather than waiting forever.
    Effect.catchDefect((defect) =>
      logDefect('storing')(defect).pipe(
        Effect.andThen(Effect.promise(() => ctx.runMutation(internal.extract.record, { articleId, outcome: FAILED }))),
      ),
    ),
  );
});

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
    // One page after another, so a site is never hit all at once (T24); each is claimed first.
    await Effect.runPromise(
      Effect.forEach(
        batch,
        ({ articleId, link }) =>
          Effect.promise(() => ctx.runMutation(internal.extract.claim, { articleId })).pipe(
            Effect.flatMap((claimed) => (claimed ? readPage(ctx, articleId, link) : Effect.void)),
            Effect.annotateLogs({ articleId }),
          ),
        { concurrency: 1, discard: true },
      ).pipe(Effect.provide(ServerLayer)),
    );
    // Keep going while anything's waiting, including Articles stored while this run read.
    if (batch.length > 0) await ctx.scheduler.runAfter(0, internal.extractPages.run, { feedId });
    return null;
  },
});
