import { Effect, Exit, Fiber, Layer } from 'effect';
import { expect, test, vi } from 'vitest';

import { fetchFeedEffect } from './fetch';
import { FeedHttp } from './http';

const rss = '<rss version="2.0"><channel><title>Example</title><link>https://a.example.com/</link></channel></rss>';

/** `fetchFeedEffect` on a fake network: `fake` stands in for `fetch`. */
const on = (fake: (url: string, init: RequestInit) => Promise<Response>) => {
  const fetch = vi.fn(fake);
  return { fetch, layer: Layer.succeed(FeedHttp, FeedHttp.make(fetch as unknown as typeof globalThis.fetch)) };
};

test('fetching a Feed as an Effect gives the same outcome as the Promise form (FEE-108)', async () => {
  const { layer } = on(async () => new Response(rss));
  const outcome = await Effect.runPromise(fetchFeedEffect('https://a.example.com/feed').pipe(Effect.provide(layer)));
  expect(outcome).toMatchObject({ _tag: 'Fetched', title: 'Example', siteUrl: 'https://a.example.com' });
});

test('its failures are outcomes, never errors', async () => {
  const { layer } = on(async () => new Response('gone', { status: 404 }));
  const exit = await Effect.runPromiseExit(fetchFeedEffect('https://a.example.com/feed').pipe(Effect.provide(layer)));
  expect(exit).toEqual(Exit.succeed({ _tag: 'Failed', reason: 'unreachable' }));
});

test('cancelling it aborts the request still in flight', async () => {
  let signal: AbortSignal | undefined;
  const { layer } = on((_, init) => {
    signal = init.signal ?? undefined;
    return new Promise(() => {});
  });
  const fiber = Effect.runFork(fetchFeedEffect('https://a.example.com/feed').pipe(Effect.provide(layer)));
  await vi.waitFor(() => expect(signal).toBeDefined());
  expect(signal!.aborted).toBe(false);
  await Effect.runPromise(Fiber.interrupt(fiber));
  expect(signal!.aborted).toBe(true);
});
