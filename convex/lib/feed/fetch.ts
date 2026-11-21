import { Effect } from 'effect';

import { FeedHttp, type Validators } from './http';
import { parseFeed } from './parse';
import { articlesToStore } from './store';
import type { AddFeedReason, StoredArticle } from './validators';

export type FetchFailure = Exclude<AddFeedReason, 'already-added'>;

const REASONS = {
  InvalidUrl: 'invalid-url',
  Unreachable: 'unreachable',
  Timeout: 'timeout',
  TooLarge: 'too-large',
  NotAFeed: 'not-a-feed',
} as const satisfies Record<string, FetchFailure>;

export type FetchOutcome =
  | { _tag: 'Fetched'; title: string; siteUrl?: string; articles: StoredArticle[]; validators: Validators }
  | { _tag: 'NotModified' }
  | { _tag: 'Failed'; reason: FetchFailure };

/**
 * Fetches a Feed under the fetch policy (T18), sending its validators (T19), and turns it
 * into what's stored. Every failure becomes a value: nothing here throws.
 */
export function fetchFeed(url: string, validators?: Validators): Promise<FetchOutcome> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const http = yield* FeedHttp;
      const response = yield* http.get(url, validators);
      if (response._tag === 'NotModified') return response;
      const feed = yield* parseFeed(response.body, Date.now());
      const { etag, lastModified } = response;
      return {
        _tag: 'Fetched' as const,
        title: feed.title,
        siteUrl: feed.siteUrl,
        articles: articlesToStore(feed.articles),
        validators: { etag, lastModified },
      };
    }).pipe(
      Effect.provide(FeedHttp.layer),
      Effect.catch((error) => Effect.succeed({ _tag: 'Failed' as const, reason: REASONS[error._tag] })),
    ),
  );
}
