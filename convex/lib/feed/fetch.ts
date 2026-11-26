import { Effect } from 'effect';

import type { FetchError } from './errors';
import { FeedHttp, type Validators } from './http';
import { parseFeed } from './parse';
import { articlesToStore } from './store';
import type { AddFeedReason, StoredArticle } from './validators';

export type FetchFailure = Exclude<AddFeedReason, 'no-feed-found'>;

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
  /** A web page, not a feed: its HTML and the address it was finally read from (T21). */
  | { _tag: 'Page'; body: string; url: string }
  | { _tag: 'Failed'; reason: FetchFailure };

/**
 * Fetches a Feed under the fetch policy (T18), sending its validators (T19), and turns it
 * into what's stored. Every failure becomes a value: it never fails. Interrupting it aborts
 * the request still in flight (FEE-108).
 */
export const fetchFeedEffect = Effect.fnUntraced(
  function* (url: string, validators?: Validators): Effect.fn.Return<FetchOutcome, FetchError, FeedHttp> {
    const http = yield* FeedHttp;
    const response = yield* http.get(url, validators);
    if (response._tag === 'NotModified') return response;
    const feed = yield* parseFeed(response.body, Date.now()).pipe(Effect.catchTag('NotAFeed', () => Effect.succeed(null)));
    if (!feed) return { _tag: 'Page', body: response.body, url: response.url };
    const { etag, lastModified } = response;
    return {
      _tag: 'Fetched',
      title: feed.title,
      siteUrl: feed.siteUrl,
      articles: articlesToStore(feed.articles),
      validators: { etag, lastModified },
    };
  },
  Effect.catch((error) => Effect.succeed({ _tag: 'Failed' as const, reason: REASONS[error._tag] })),
);

/** `fetchFeedEffect` on the live network, for Promise callers. */
export function fetchFeed(url: string, validators?: Validators): Promise<FetchOutcome> {
  return Effect.runPromise(fetchFeedEffect(url, validators).pipe(Effect.provide(FeedHttp.layer)));
}
