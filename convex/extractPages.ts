'use node';

import { v } from 'convex/values';

import { Effect } from 'effect';

import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { internalAction, type ActionCtx } from './_generated/server';
import { fetchAndExtractEffect, type ExtractOutcome } from './lib/feed/extract';
import { FeedHttp } from './lib/feed/http';

const FAILED: ExtractOutcome = { _tag: 'Failed' };

/**
 * Reads one Article's page and stores what it found. A page that can't be fetched or read falls
 * back, and so does a defect while reading it or storing it: a bug costs only that Article, which
 * falls back rather than waiting forever (FEE-110).
 */
const readPage = Effect.fnUntraced(function* (ctx: ActionCtx, articleId: Id<'articles'>, link: string | undefined) {
  const outcome = link
    ? yield* fetchAndExtractEffect(link).pipe(
        Effect.catch(() => Effect.succeed(FAILED)),
        Effect.catchDefect(() => Effect.succeed(FAILED)),
      )
    : FAILED;
  yield* Effect.promise(() => ctx.runMutation(internal.extract.record, { articleId, outcome })).pipe(
    Effect.catchDefect(() =>
      Effect.promise(async () => {
        // Too big to store, or anything else unexpected. Logged by the Article's id only (Q9).
        console.warn('extract: storing failed, falling back', articleId);
        await ctx.runMutation(internal.extract.record, { articleId, outcome: FAILED });
      }),
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
          ),
        { concurrency: 1, discard: true },
      ).pipe(Effect.provide(FeedHttp.layer)),
    );
    // Keep going while anything's waiting, including Articles stored while this run read.
    if (batch.length > 0) await ctx.scheduler.runAfter(0, internal.extractPages.run, { feedId });
    return null;
  },
});
