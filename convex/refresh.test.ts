/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { runScheduledNow } from '../test/convex-scheduled';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { MAX_INTERVAL, backoff } from './lib/feed/pace';
import schema from './schema';

vi.mock('@convex-dev/auth/server', async (original) => ({
  ...(await original<typeof import('@convex-dev/auth/server')>()),
  getAuthUserId: async (ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) =>
    (await ctx.auth.getUserIdentity())?.subject ?? null,
}));

/** Storing a fetch can be made to break, as a limit hit mid-store would (FEE-110). */
const storing = vi.hoisted(() => ({ broken: false }));
vi.mock('./lib/feed/record', async (original) => {
  const real = await original<typeof import('./lib/feed/record')>();
  return {
    ...real,
    storeNewArticles: async (...args: Parameters<typeof real.storeNewArticles>) => {
      if (storing.broken) throw new Error('storing https://a.example.com/feed broke');
      return real.storeNewArticles(...args);
    },
  };
});

const modules = import.meta.glob('./**/*.ts');

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const START = Date.UTC(2026, 10, 21, 12);
const URL_A = 'https://a.example.com/feed';

/** An RSS document with these Articles, `ago` milliseconds before now. */
const rss = (items: { guid: string; ago: number; title?: string }[], now = Date.now()) =>
  `<rss version="2.0"><channel><title>Example</title><link>https://a.example.com/</link>${items
    .map(
      ({ guid, ago, title }) =>
        `<item><title>${title ?? guid}</title><guid>${guid}</guid><pubDate>${new Date(now - ago).toUTCString()}</pubDate></item>`,
    )
    .join('')}</channel></rss>`;

const network = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

beforeEach(() => {
  storing.broken = false;
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
  expect(await s.a.action(api.feeds.add, { url: URL_A })).toMatchObject({ ok: true });
  const stored = await s.t.run(async (ctx) => (await ctx.db.query('feeds').first())!);
  return (await feedOf(s, stored._id))!;
}

/** A Feed with its fetch schedule (FEE-54) read alongside, as one record. */
const feedOf = (s: Awaited<ReturnType<typeof setup>>, id: Id<'feeds'>) =>
  s.t.run(async (ctx) => {
    const feed = await ctx.db.get(id);
    const schedule = await ctx.db.query('feedSchedules').withIndex('by_feed', (q) => q.eq('feedId', id)).unique();
    if (!feed) return feed;
    // Every stored Feed has a schedule; a missing one is a bug, not a Feed to read without it.
    if (!schedule) throw new Error(`Feed ${id} has no schedule`);
    const { nextFetchAt, lastFetchedAt, failures, etag, lastModified } = schedule;
    return { ...feed, nextFetchAt, lastFetchedAt, failures, etag, lastModified };
  });

/** Feeds stored straight in the table, each with a schedule due at `nextFetchAt` (now, by default). */
const insertFeeds = (s: Awaited<ReturnType<typeof setup>>, count: number, nextFetchAt = 0) =>
  s.t.run(async (ctx) => {
    for (let i = 0; i < count; i++) {
      const feedId = await ctx.db.insert('feeds', { userId: s.userA, url: `https://f${i}.example.com/feed`, title: `F${i}` });
      await ctx.db.insert('feedSchedules', { feedId, userId: s.userA, nextFetchAt, failures: 0 });
    }
  });
const refresh = (s: Awaited<ReturnType<typeof setup>>, feedId: Id<'feeds'>) =>
  s.t.action(internal.refresh.refreshFeed, { feedId });

describe('each Feed on its own pace (T19)', () => {
  test('a new Feed is working, with its next check set from its pace', async () => {
    const s = await setup();
    // 4 a day for two weeks: checked every 3 hours.
    const items = Array.from({ length: 56 }, (_, i) => ({ guid: `g${i}`, ago: (i + 1) * 6 * HOUR }));
    const feed = await follow(s, items);
    expect(feed).toMatchObject({ status: 'working', failures: 0, lastFetchedAt: START, nextFetchAt: START + 3 * HOUR });
  });

  test('the cron fetches only Feeds that are due, and leases them so a slow fetch is not doubled', async () => {
    const s = await setup();
    const feed = await follow(s, [{ guid: 'g0', ago: HOUR }]);
    network.mockClear();

    await s.t.mutation(internal.refresh.scheduleDue, {});
    await runScheduledNow(s.t);
    expect(network).not.toHaveBeenCalled();

    vi.setSystemTime(feed.nextFetchAt! + MINUTE);
    network.mockImplementation(async () => new Response(rss([{ guid: 'g0', ago: HOUR }])));
    await s.t.mutation(internal.refresh.scheduleDue, {});
    await s.t.mutation(internal.refresh.scheduleDue, {});
    await runScheduledNow(s.t);
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

  // FEE-93: a rare writer's last posts are kept, whatever their age, so their page is never empty.
  test("Articles past the 30 days are stored only when they're among the Feed's five newest", async () => {
    const s = await setup();
    const feed = await follow(s, [{ guid: 'g1', ago: HOUR }]);
    const old = [40, 50, 60, 70, 80, 90].map((days) => ({ guid: `old${days}`, ago: days * DAY }));
    network.mockImplementation(async () => new Response(rss([{ guid: 'g1', ago: HOUR }, ...old])));
    await refresh(s, feed._id);
    expect((await s.a.query(api.articles.all, { feedId: feed._id })).map((r) => r.title)).toEqual(['g1', 'old40', 'old50', 'old60', 'old70']);
  });

  test('a Feed whose posts are all months old keeps its five newest when it is added', async () => {
    const s = await setup();
    const feed = await follow(
      s,
      [45, 60, 90, 120, 150, 200, 250].map((days) => ({ guid: `p${days}`, ago: days * DAY })),
    );
    expect((await s.a.query(api.articles.all, { feedId: feed._id })).map((r) => r.title)).toEqual(['p45', 'p60', 'p90', 'p120', 'p150']);
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

describe('Feeds and Articles stored before rows were complete (FEE-27)', () => {
  test("a Feed without its site is fetched in full, not asked for a 304, so it learns its site", async () => {
    const s = await setup();
    const feed = await follow(s, [{ guid: 'g1', ago: HOUR }], { etag: '"v1"' });
    await s.t.run((ctx) => ctx.db.patch(feed._id, { siteUrl: undefined }));
    network.mockImplementation(
      async () =>
        new Response(
          `<rss version="2.0"><channel><title>T</title><link>https://site.example.com/</link><item><title>g1</title><guid>g1</guid></item></channel></rss>`,
        ),
    );
    await refresh(s, feed._id);
    expect(new Headers(network.mock.calls.at(-1)![1].headers).get('if-none-match')).toBeNull();
    expect((await feedOf(s, feed._id))!.siteUrl).toBe('https://site.example.com');
  });

  test('an Article stored without a lead image gains one when its Feed has it', async () => {
    const s = await setup();
    const feed = await follow(s, [{ guid: 'g1', ago: HOUR }]);
    network.mockImplementation(
      async () =>
        new Response(
          `<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>T</title><item><title>g1</title><guid>g1</guid><media:thumbnail url="https://cdn.example.com/g1.jpg"/></item></channel></rss>`,
        ),
    );
    await refresh(s, feed._id);
    expect((await s.a.query(api.articles.all, {}))[0].imageUrl).toBe('https://cdn.example.com/g1.jpg');
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
    await runScheduledNow(s.t);
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

describe('a network blip is retried, not counted against the Feed (FEE-111)', () => {
  /** Refreshes `feed` an hour on, letting the fake clock run through any retries. */
  async function refreshLater(s: Awaited<ReturnType<typeof setup>>, feedId: Id<'feeds'>) {
    vi.setSystemTime(START + HOUR);
    const done = refresh(s, feedId);
    await vi.advanceTimersByTimeAsync(11_000);
    await done;
  }

  test('a dropped connection, then an answer, stores the new Articles and leaves the Feed working', async () => {
    const s = await setup();
    const feed = await follow(s, [{ guid: 'g1', ago: HOUR }]);
    network.mockClear();
    let tries = 0;
    network.mockImplementation(async () =>
      tries++ === 0 ? Promise.reject(new TypeError('connection reset')) : new Response(rss([{ guid: 'g1', ago: 2 * HOUR }, { guid: 'g2', ago: 0 }])),
    );
    await refreshLater(s, feed._id);
    expect(network).toHaveBeenCalledTimes(2);
    expect(await feedOf(s, feed._id)).toMatchObject({ status: 'working', failures: 0 });
    expect(await s.a.query(api.articles.all, {})).toHaveLength(2);
  });

  test('a Feed busy on every try is tried three times, then marked failing and backs off as before (Q7)', async () => {
    const s = await setup();
    const feed = await follow(s, [{ guid: 'g1', ago: HOUR }]);
    network.mockReset();
    network.mockImplementation(async () => new Response('busy', { status: 503 }));
    await refreshLater(s, feed._id);
    expect(network).toHaveBeenCalledTimes(3);
    const failed = (await feedOf(s, feed._id))!;
    expect(failed).toMatchObject({ status: 'failing', failures: 1 });
    expect(failed.nextFetchAt).toBe(failed.lastFetchedAt! + backoff(1));
  });

  test('a 404 reaches the network once', async () => {
    const s = await setup();
    const feed = await follow(s, [{ guid: 'g1', ago: HOUR }]);
    network.mockReset();
    network.mockImplementation(async () => new Response('gone', { status: 404 }));
    await refreshLater(s, feed._id);
    expect(network).toHaveBeenCalledTimes(1);
    expect(await feedOf(s, feed._id)).toMatchObject({ status: 'failing', failures: 1 });
  });
});

describe('a bug is kept apart from an ordinary failure (FEE-110)', () => {
  test('a defect while storing a fetch is recorded as a failure, the Feed backs off, and nothing logged names its URL (Q7, Q9)', async () => {
    const s = await setup();
    const feed = await follow(s, [{ guid: 'g1', ago: HOUR }]);
    const logged = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
    storing.broken = true;
    network.mockImplementation(async () => new Response(rss([{ guid: 'g2', ago: 0 }])));
    vi.setSystemTime(START + HOUR);
    await refresh(s, feed._id);
    const failed = (await feedOf(s, feed._id))!;
    expect(failed).toMatchObject({ status: 'failing', failures: 1 });
    expect(failed.nextFetchAt).toBe(failed.lastFetchedAt! + backoff(1));
    expect(await s.a.query(api.articles.all, {})).toHaveLength(1);
    expect(JSON.stringify(logged.flatMap((spy) => spy.mock.calls))).not.toContain(URL_A);
    logged.forEach((spy) => spy.mockRestore());
  });

  test('a pull whose storing breaks for one Feed still records it as failing, and still answers', async () => {
    const s = await setup();
    const feed = await follow(s, [{ guid: 'g1', ago: HOUR }]);
    storing.broken = true;
    vi.setSystemTime(START + HOUR);
    expect(await s.a.action(api.feeds.refreshAll, {})).toBe(START + HOUR);
    expect(await feedOf(s, feed._id)).toMatchObject({ status: 'failing', failures: 1 });
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
    const done = refresh(s, feed._id);
    await vi.advanceTimersByTimeAsync(11_000);
    await done;
    expect(await feedOf(s, feed._id)).toMatchObject({ status: 'failing', failures: 1 });
  });

  test('a tick with more due Feeds than it starts at once comes back for the rest', async () => {
    const s = await setup();
    await insertFeeds(s, 60);
    network.mockImplementation(async () => new Response(rss([])));
    await s.t.mutation(internal.refresh.scheduleDue, {});
    await runScheduledNow(s.t);
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
    // Not due: this is about pulling, so the fetch scheduler has nothing to start meanwhile.
    await insertFeeds(s, 12, START + DAY);
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

  test("one Feed that fails doesn't stop the others, and the pull still answers (FEE-108)", async () => {
    const s = await setup();
    await insertFeeds(s, 6, START + DAY);
    network.mockImplementation(async (url) =>
      url.includes('f2.') ? new Response('gone', { status: 404 }) : new Response(rss([{ guid: `g-${url}`, ago: HOUR }])),
    );
    vi.setSystemTime(START + HOUR);
    expect(await s.a.action(api.feeds.refreshAll, {})).toBe(START + HOUR);
    expect(network).toHaveBeenCalledTimes(6);
    const schedules = await s.t.run((ctx) => ctx.db.query('feedSchedules').collect());
    expect(schedules.filter((schedule) => schedule.lastFetchedAt === START + HOUR)).toHaveLength(6);
    expect(schedules.filter((schedule) => schedule.failures === 1)).toHaveLength(1);
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

  // FEE-103: the app holds "Updating…" until its "Updated" line has caught up with what the pull recorded.
  test('a pull answers with the newest fetch it recorded, which the "Updated" line then reads', async () => {
    const s = await setup();
    await follow(s, [{ guid: 'g1', ago: HOUR }]);
    vi.setSystemTime(START + HOUR);
    const until = await s.a.action(api.feeds.refreshAll, {});
    expect(until).toBe(START + HOUR);
    expect(await s.a.query(api.feeds.lastUpdated, {})).toBeGreaterThanOrEqual(until!);
  });

  test("a failed fetch is still a fetch the line counts, so the pull answers with it", async () => {
    const s = await setup();
    await follow(s, [{ guid: 'g1', ago: HOUR }]);
    vi.setSystemTime(START + HOUR);
    // A lasting failure: a busy one (503) is retried first (FEE-111).
    network.mockImplementation(async () => new Response('down', { status: 500 }));
    const until = await s.a.action(api.feeds.refreshAll, {});
    expect(until).toBe(START + HOUR);
    expect(await s.a.query(api.feeds.lastUpdated, {})).toBeGreaterThanOrEqual(until!);
  });

  test('a pull that fetched nothing (every Feed fetched in the last two minutes) answers null', async () => {
    const s = await setup();
    await follow(s, [{ guid: 'g1', ago: HOUR }]);
    expect(await s.a.action(api.feeds.refreshAll, {})).toBeNull();
  });

  test("a pull answers with nothing of another User's", async () => {
    const s = await setup();
    await follow(s, [{ guid: 'g1', ago: HOUR }]);
    vi.setSystemTime(START + HOUR);
    expect(await s.b.action(api.feeds.refreshAll, {})).toBeNull();
  });
});

describe('cleaning up old Articles (P14)', () => {
  test('deletes Articles and their bodies 30 days after publication, and keeps newer ones', async () => {
    const s = await setup();
    // A busy Feed: its five newest are recent, so the old one isn't one it keeps (FEE-93).
    const feed = await follow(s, [
      { guid: 'old', ago: 29 * DAY },
      ...[1, 2, 3, 4, 5].map((hours) => ({ guid: `new${hours}`, ago: hours * HOUR })),
    ]);
    vi.setSystemTime(START + 2 * DAY);
    await s.t.mutation(internal.refresh.cleanup, {});
    await runScheduledNow(s.t);
    expect((await s.a.query(api.articles.all, { feedId: feed._id })).map((r) => r.title)).toEqual(['new1', 'new2', 'new3', 'new4', 'new5']);
    expect(await s.t.run((ctx) => ctx.db.query('articleBodies').take(1000))).toHaveLength(5);
  });

  // FEE-93: the cleanup keeps each Feed's five newest, so a rare writer never empties out.
  test("keeps each Feed's five newest, however old, and deletes its other old Articles", async () => {
    const s = await setup();
    const feed = await follow(s, [{ guid: 'g0', ago: HOUR }]);
    await s.t.run(async (ctx) => {
      for (let i = 1; i <= 8; i++) {
        const articleId = await ctx.db.insert('articles', { userId: s.userA, feedId: feed._id, guid: `o${i}`, title: `o${i}`, publishedAt: START - (30 + i) * DAY });
        await ctx.db.insert('articleBodies', { userId: s.userA, articleId, blocks: [], omitted: [] });
      }
    });
    await s.t.mutation(internal.refresh.cleanup, {});
    await runScheduledNow(s.t);
    expect((await s.a.query(api.articles.all, { feedId: feed._id })).map((r) => r.title)).toEqual(['g0', 'o1', 'o2', 'o3', 'o4']);
    expect(await s.t.run((ctx) => ctx.db.query('articleBodies').take(1000))).toHaveLength(5);
  });

  test('a busy Feed loses everything past 30 days, since its five newest are recent', async () => {
    const s = await setup();
    const feed = await follow(
      s,
      [1, 2, 3, 4, 5, 6].map((hours) => ({ guid: `n${hours}`, ago: hours * HOUR })),
    );
    await s.t.run(async (ctx) => {
      await ctx.db.insert('articles', { userId: s.userA, feedId: feed._id, guid: 'stale', title: 'stale', publishedAt: START - 40 * DAY });
    });
    await s.t.mutation(internal.refresh.cleanup, {});
    await runScheduledNow(s.t);
    expect((await s.a.query(api.articles.all, { feedId: feed._id })).map((r) => r.title)).not.toContain('stale');
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
    await runScheduledNow(s.t);
    // The Feed's five newest stay: its recent one and four of the old ones, even with identical publish times.
    expect(await s.t.run((ctx) => ctx.db.query('articles').take(1000))).toHaveLength(5);
    expect(await s.t.run((ctx) => ctx.db.query('articleBodies').take(1000))).toHaveLength(5);
  });

  // FEE-93: All stays about what's new; a rare writer's kept old posts show on its own page, not at All's bottom.
  test("All shows only the last 30 days, while a Feed's page shows its kept older posts", async () => {
    const s = await setup();
    const feed = await follow(s, [
      { guid: 'recent', ago: HOUR },
      { guid: 'months', ago: 90 * DAY },
    ]);
    expect((await s.a.query(api.articles.all, {})).map((r) => r.title)).toEqual(['recent']);
    expect((await s.a.query(api.articles.all, { feedId: feed._id })).map((r) => r.title)).toEqual(['recent', 'months']);
  });

  test("another User can't read a Feed's kept posts", async () => {
    const s = await setup();
    const feed = await follow(s, [{ guid: 'months', ago: 90 * DAY }]);
    expect(await s.b.query(api.articles.all, { feedId: feed._id })).toEqual([]);
  });
});
