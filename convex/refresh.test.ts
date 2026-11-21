/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { MAX_INTERVAL, backoff } from './lib/feed/pace';
import schema from './schema';

vi.mock('@convex-dev/auth/server', async (original) => ({
  ...(await original<typeof import('@convex-dev/auth/server')>()),
  getAuthUserId: async (ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) =>
    (await ctx.auth.getUserIdentity())?.subject ?? null,
}));

const modules = import.meta.glob('./**/*.ts');

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const START = Date.UTC(2026, 10, 21, 12);
const URL_A = 'https://a.example.com/feed';

/** An RSS document with these Articles, `ago` milliseconds before now. */
const rss = (items: { guid: string; ago: number; title?: string }[], now = Date.now()) =>
  `<rss version="2.0"><channel><title>Example</title>${items
    .map(
      ({ guid, ago, title }) =>
        `<item><title>${title ?? guid}</title><guid>${guid}</guid><pubDate>${new Date(now - ago).toUTCString()}</pubDate></item>`,
    )
    .join('')}</channel></rss>`;

const network = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  network.mockReset();
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => network(url, init));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function setup() {
  const t = convexTest(schema, modules);
  const [a, b] = await t.run(async (ctx) => [
    await ctx.db.insert('users', { email: 'a@example.com' }),
    await ctx.db.insert('users', { email: 'b@example.com' }),
  ]);
  return { t, a: t.withIdentity({ subject: a }), b: t.withIdentity({ subject: b }), userA: a };
}

/** User A follows a Feed that starts with these Articles. */
async function follow(s: Awaited<ReturnType<typeof setup>>, items: { guid: string; ago: number }[], headers = {}) {
  network.mockImplementation(async () => new Response(rss(items), { headers }));
  expect(await s.a.action(api.feeds.add, { url: URL_A })).toEqual({ ok: true });
  return await s.t.run(async (ctx) => (await ctx.db.query('feeds').first())!);
}

const feedOf = (s: Awaited<ReturnType<typeof setup>>, id: Id<'feeds'>) => s.t.run((ctx) => ctx.db.get(id));
const refresh = (s: Awaited<ReturnType<typeof setup>>, feedId: Id<'feeds'>) =>
  s.t.action(internal.refresh.refreshFeed, { feedId });

describe('each Feed on its own pace (T19)', () => {
  test('a new Feed is working, with its next check set from its pace', async () => {
    const s = await setup();
    // 4 a day for two weeks: checked every 3 hours.
    const items = Array.from({ length: 56 }, (_, i) => ({ guid: `g${i}`, ago: (i + 0.5) * 6 * HOUR }));
    const feed = await follow(s, items);
    expect(feed).toMatchObject({ status: 'working', failures: 0, lastFetchedAt: START, nextFetchAt: START + 3 * HOUR });
  });

  test('the cron fetches only Feeds that are due, and leases them so a slow fetch is not doubled', async () => {
    const s = await setup();
    const feed = await follow(s, [{ guid: 'g0', ago: HOUR }]);
    network.mockClear();

    await s.t.mutation(internal.refresh.scheduleDue, {});
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(network).not.toHaveBeenCalled();

    vi.setSystemTime(feed.nextFetchAt! + MINUTE);
    network.mockImplementation(async () => new Response(rss([{ guid: 'g0', ago: HOUR }])));
    await s.t.mutation(internal.refresh.scheduleDue, {});
    await s.t.mutation(internal.refresh.scheduleDue, {});
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(network).toHaveBeenCalledTimes(1);
  });

  test('new Articles appear in All; re-fetching never duplicates one', async () => {
    const s = await setup();
    const feed = await follow(s, [{ guid: 'g1', ago: 2 * HOUR }]);
    network.mockImplementation(async () =>
      new Response(rss([{ guid: 'g2', ago: 10 * MINUTE, title: 'Fresh' }, { guid: 'g1', ago: 2 * HOUR }])),
    );
    await refresh(s, feed._id);
    await refresh(s, feed._id);
    expect((await s.a.query(api.articles.all, {})).map((r) => r.title)).toEqual(['Fresh', 'g1']);
  });

  test("Articles already past the 30 days kept aren't stored, only to be deleted", async () => {
    const s = await setup();
    const feed = await follow(s, [{ guid: 'g1', ago: HOUR }]);
    network.mockImplementation(async () => new Response(rss([{ guid: 'old', ago: 40 * DAY }, { guid: 'g1', ago: HOUR }])));
    await refresh(s, feed._id);
    expect((await s.a.query(api.articles.all, {})).map((r) => r.title)).toEqual(['g1']);
  });
});

describe('conditional requests (T19)', () => {
  test("sends back the Feed's validators; a 304 keeps everything and sets the next check", async () => {
    const s = await setup();
    const feed = await follow(s, [{ guid: 'g1', ago: HOUR }], { etag: '"v1"', 'last-modified': 'Sat, 21 Nov 2026 11:00:00 GMT' });
    expect(feed).toMatchObject({ etag: '"v1"', lastModified: 'Sat, 21 Nov 2026 11:00:00 GMT' });

    vi.setSystemTime(START + HOUR);
    network.mockImplementation(async () => new Response(null, { status: 304 }));
    await refresh(s, feed._id);
    const headers = new Headers(network.mock.calls.at(-1)![1].headers);
    expect(headers.get('if-none-match')).toBe('"v1"');
    expect(await feedOf(s, feed._id)).toMatchObject({ status: 'working', lastFetchedAt: START + HOUR, etag: '"v1"' });
    expect(await s.a.query(api.articles.all, {})).toHaveLength(1);
  });
});

describe('a Feed that stops working (Q7)', () => {
  test.each([
    ['times out', () => new Promise<Response>(() => {})],
    ['returns an HTTP error', async () => new Response('down', { status: 503 })],
    ['serves invalid XML', async () => new Response('<html><body>Moved</body></html>')],
  ])('one that %s is marked not working, keeps its Articles, and backs off', async (_case, answer) => {
    const s = await setup();
    const feed = await follow(s, [{ guid: 'g1', ago: HOUR }]);
    network.mockImplementation(answer);

    vi.setSystemTime(START + HOUR);
    const done = refresh(s, feed._id);
    await vi.advanceTimersByTimeAsync(11_000);
    await done;
    const failed = (await feedOf(s, feed._id))!;
    expect(failed).toMatchObject({ status: 'failing', failures: 1 });
    // Backed off from when the failure was known (after the 10-second timeout, for that case).
    expect(failed.nextFetchAt).toBe(failed.lastFetchedAt! + backoff(1));
    expect(await s.a.query(api.articles.all, {})).toHaveLength(1);

    // Not retried on every tick: nothing is due until the backoff passes.
    network.mockClear();
    vi.setSystemTime(START + HOUR + 10 * MINUTE);
    await s.t.mutation(internal.refresh.scheduleDue, {});
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(network).not.toHaveBeenCalled();
  });

  test('failures in a row back off further, and a Feed that works again is marked working', async () => {
    const s = await setup();
    const feed = await follow(s, [{ guid: 'g1', ago: HOUR }]);
    network.mockImplementation(async () => new Response('down', { status: 500 }));
    await refresh(s, feed._id);
    await refresh(s, feed._id);
    await refresh(s, feed._id);
    expect(await feedOf(s, feed._id)).toMatchObject({ status: 'failing', failures: 3, nextFetchAt: START + backoff(3) });

    network.mockImplementation(async () => new Response(rss([{ guid: 'g1', ago: HOUR }])));
    await refresh(s, feed._id);
    expect(await feedOf(s, feed._id)).toMatchObject({ status: 'working', failures: 0, nextFetchAt: START + MAX_INTERVAL });
  });
});

describe('fetches that overlap or misbehave', () => {
  test('an older result never overwrites a newer one', async () => {
    const s = await setup();
    const feed = await follow(s, [{ guid: 'g1', ago: HOUR }]);
    await s.t.mutation(internal.refresh.recordFailure, { feedId: feed._id, now: START - MINUTE });
    expect(await feedOf(s, feed._id)).toMatchObject({ status: 'working', failures: 0, lastFetchedAt: START });
  });

  test('a fetch that throws is recorded as a failure, so it backs off', async () => {
    const s = await setup();
    const feed = await follow(s, [{ guid: 'g1', ago: HOUR }]);
    network.mockImplementation(() => {
      throw new Error('not even a rejected promise');
    });
    await refresh(s, feed._id);
    expect(await feedOf(s, feed._id)).toMatchObject({ status: 'failing', failures: 1 });
  });

  test('a tick with more due Feeds than it starts at once comes back for the rest', async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      for (let i = 0; i < 60; i++) await ctx.db.insert('feeds', { userId: s.userA, url: `https://f${i}.example.com/feed`, title: `F${i}` });
    });
    network.mockImplementation(async () => new Response(rss([])));
    await s.t.mutation(internal.refresh.scheduleDue, {});
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(network).toHaveBeenCalledTimes(60);
  });
});

describe('pulling down fetches every Feed now', () => {
  test("fetches the User's own Feeds, and no one else's", async () => {
    const s = await setup();
    await follow(s, [{ guid: 'g1', ago: HOUR }]);
    network.mockClear();
    vi.setSystemTime(START + HOUR);

    await s.b.action(api.feeds.refreshAll, {});
    expect(network).not.toHaveBeenCalled();
    await s.a.action(api.feeds.refreshAll, {});
    expect(network).toHaveBeenCalledTimes(1);
  });

  test('a pull fetches at most a few Feeds at a time', async () => {
    const s = await setup();
    await s.t.run(async (ctx) => {
      for (let i = 0; i < 12; i++) await ctx.db.insert('feeds', { userId: s.userA, url: `https://f${i}.example.com/feed`, title: `F${i}` });
    });
    // Answers are held open until released, so overlapping fetches pile up here.
    const waiting: (() => void)[] = [];
    network.mockImplementation(() => new Promise((resolve) => waiting.push(() => resolve(new Response(rss([]))))));
    let done = false;
    const pull = s.a.action(api.feeds.refreshAll, {}).finally(() => (done = true));
    let most = 0;
    for (let i = 0; i < 500 && !done; i++) {
      await vi.advanceTimersByTimeAsync(1);
      most = Math.max(most, waiting.length);
      waiting.splice(0).forEach((release) => release());
    }
    await pull;
    expect(network).toHaveBeenCalledTimes(12);
    expect(most).toBeGreaterThan(1);
    expect(most).toBeLessThanOrEqual(4);
  });

  test("repeated pulls don't refetch a Feed fetched in the last two minutes", async () => {
    const s = await setup();
    await follow(s, [{ guid: 'g1', ago: HOUR }]);
    network.mockClear();
    await s.a.action(api.feeds.refreshAll, {});
    vi.setSystemTime(START + MINUTE);
    await s.a.action(api.feeds.refreshAll, {});
    expect(network).not.toHaveBeenCalled();
  });

  test('signed out, it is refused', async () => {
    const s = await setup();
    await expect(s.t.action(api.feeds.refreshAll, {})).rejects.toThrow(/SIGNED_OUT/);
  });
});

describe('cleaning up old Articles (P14)', () => {
  test('deletes Articles and their bodies 30 days after publication, and keeps newer ones', async () => {
    const s = await setup();
    await follow(s, [
      { guid: 'old', ago: 29 * DAY },
      { guid: 'new', ago: HOUR },
    ]);
    vi.setSystemTime(START + 2 * DAY);
    await s.t.mutation(internal.refresh.cleanup, {});
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await s.a.query(api.articles.all, {})).map((r) => r.title)).toEqual(['new']);
    expect(await s.t.run((ctx) => ctx.db.query('articleBodies').take(1000))).toHaveLength(1);
  });

  test('a large backlog is deleted over several runs, in batches', async () => {
    const s = await setup();
    const feed = await follow(s, [{ guid: 'g0', ago: HOUR }]);
    await s.t.run(async (ctx) => {
      for (let i = 0; i < 600; i++) {
        const articleId = await ctx.db.insert('articles', {
          userId: s.userA,
          feedId: feed._id,
          guid: `x${i}`,
          title: `x${i}`,
          publishedAt: START - 40 * DAY,
        });
        await ctx.db.insert('articleBodies', { userId: s.userA, articleId, blocks: [], omitted: [] });
      }
    });
    await s.t.mutation(internal.refresh.cleanup, {});
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await s.t.run((ctx) => ctx.db.query('articles').take(1000))).toHaveLength(1);
    expect(await s.t.run((ctx) => ctx.db.query('articleBodies').take(1000))).toHaveLength(1);
  });
});
