/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

vi.mock('@convex-dev/auth/server', async (original) => ({
  ...(await original<typeof import('@convex-dev/auth/server')>()),
  getAuthUserId: async (ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) =>
    (await ctx.auth.getUserIdentity())?.subject ?? null,
}));

const modules = import.meta.glob('./**/*.ts');

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const START = Date.UTC(2026, 10, 21, 12);

const rss = (guids: string[], now = Date.now()) =>
  `<rss version="2.0"><channel><title>Example</title><link>https://example.com/</link>${guids
    .map((guid, i) => `<item><title>${guid}</title><guid>${guid}</guid><pubDate>${new Date(now - (i + 1) * 60 * MINUTE).toUTCString()}</pubDate></item>`)
    .join('')}</channel></rss>`;

const network = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  network.mockReset();
  network.mockImplementation(async () => new Response(rss(['one', 'two']), { headers: { etag: '"v1"' } }));
  vi.stubGlobal('fetch', (url: string, init: RequestInit) => network(url, init));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Users A and B, each following one Feed. */
async function setup() {
  const t = convexTest(schema, modules);
  const [a, b] = await t.run(async (ctx) => [
    await ctx.db.insert('users', { email: 'a@example.com' }),
    await ctx.db.insert('users', { email: 'b@example.com' }),
  ]);
  const asA = t.withIdentity({ subject: a });
  const asB = t.withIdentity({ subject: b });
  await asA.action(api.feeds.add, { url: 'https://a.example.com/feed' });
  await asB.action(api.feeds.add, { url: 'https://b.example.com/feed' });
  const feedOf = (userId: Id<'users'>) =>
    t.run(async (ctx) => (await ctx.db.query('feeds').collect()).find((feed) => feed.userId === userId)!);
  const scheduleOf = (feedId: Id<'feeds'>) =>
    t.run(async (ctx) => await ctx.db.query('feedSchedules').withIndex('by_feed', (q) => q.eq('feedId', feedId)).unique());
  return { t, a, b, asA, feedOf, scheduleOf };
}

/** Lets every Feed fall due, then runs the cron and the fetches it starts. */
async function checkDueFeeds(t: ReturnType<typeof convexTest>) {
  vi.setSystemTime(Date.now() + 2 * DAY);
  await t.mutation(internal.refresh.scheduleDue, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

describe("a Feed's fetch schedule lives apart from the Feed (FEE-54)", () => {
  test('adding a Feed gives it a schedule, due again by its pace', async () => {
    const { a, feedOf, scheduleOf } = await setup();
    const feed = await feedOf(a);
    const schedule = await scheduleOf(feed._id);
    expect(schedule).toMatchObject({ userId: a, failures: 0, lastFetchedAt: START, etag: '"v1"' });
    expect(schedule!.nextFetchAt).toBeGreaterThan(START);
    expect(feed).not.toHaveProperty('nextFetchAt');
  });

  test('a check that finds nothing new changes nothing All, the chips or Manage Feeds read', async () => {
    const { t, a, feedOf, scheduleOf } = await setup();
    const before = await feedOf(a);
    const scheduleBefore = await scheduleOf(before._id);
    // The Feed answers "not modified": nothing to store.
    network.mockImplementation(async () => new Response(null, { status: 304 }));

    await checkDueFeeds(t);

    expect(await feedOf(a)).toEqual(before);
    expect((await scheduleOf(before._id))!.lastFetchedAt).toBeGreaterThan(scheduleBefore!.lastFetchedAt!);
  });

  test('a full fetch with no new Articles leaves the Feed row alone too', async () => {
    const { t, a, feedOf } = await setup();
    const before = await feedOf(a);

    await checkDueFeeds(t);

    expect(await feedOf(a)).toEqual(before);
  });

  test("the Feed's status is written only when it changes", async () => {
    const { t, a, feedOf, scheduleOf } = await setup();
    network.mockImplementation(async () => new Response('gone', { status: 404 }));

    await checkDueFeeds(t);
    const failing = await feedOf(a);
    expect(failing.status).toBe('failing');
    await checkDueFeeds(t);

    // A second failure in a row backs off further, but the Feed row is untouched.
    expect(await feedOf(a)).toEqual(failing);
    expect((await scheduleOf(failing._id))!.failures).toBe(2);
  });

  test("checking A's Feeds never touches B's schedule", async () => {
    const { t, a, b, feedOf, scheduleOf } = await setup();
    const feedB = await feedOf(b);
    const scheduleB = await scheduleOf(feedB._id);
    // Only A's Feed falls due.
    const scheduleA = await scheduleOf((await feedOf(a))._id);
    await t.run((ctx) => ctx.db.patch(scheduleA!._id, { nextFetchAt: 0 }));

    await t.mutation(internal.refresh.scheduleDue, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await scheduleOf(feedB._id)).toEqual(scheduleB);
  });

  test('removing a Feed removes its schedule', async () => {
    const { t, a, asA, feedOf, scheduleOf } = await setup();
    const feed = await feedOf(a);

    await asA.mutation(api.feeds.remove, { id: feed._id });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await scheduleOf(feed._id)).toBeNull();
  });
});

describe('moving existing Feeds onto schedules (FEE-54 migration)', () => {
  /** A Feed stored before FEE-54, with its schedule on the Feed itself. */
  let feeds = 0;
  const oldFeed = (userId: Id<'users'>, fields: Record<string, unknown>) => ({
    userId,
    url: `https://old-${(feeds += 1)}.example.com/feed`,
    title: 'Old',
    status: 'working' as const,
    ...fields,
  });

  test('each Feed keeps its schedule exactly, and the Feed loses the old fields', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert('users', { email: 'a@example.com' }));
    const feedId = await t.run((ctx) =>
      ctx.db.insert(
        'feeds',
        oldFeed(userId, { nextFetchAt: START + 3 * MINUTE, lastFetchedAt: START - MINUTE, failures: 2, etag: '"e"', lastModified: 'Sat' }),
      ),
    );

    await t.mutation(internal.migrations.moveFeedSchedules, {});

    const schedule = await t.run((ctx) => ctx.db.query('feedSchedules').withIndex('by_feed', (q) => q.eq('feedId', feedId)).unique());
    expect(schedule).toMatchObject({
      feedId,
      userId,
      nextFetchAt: START + 3 * MINUTE,
      lastFetchedAt: START - MINUTE,
      failures: 2,
      etag: '"e"',
      lastModified: 'Sat',
    });
    const feed = await t.run((ctx) => ctx.db.get(feedId));
    for (const field of ['nextFetchAt', 'lastFetchedAt', 'failures', 'etag', 'lastModified']) expect(feed).not.toHaveProperty(field);
  });

  test('a Feed that was due now stays due now, and running it twice changes nothing', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run((ctx) => ctx.db.insert('users', { email: 'a@example.com' }));
    await t.run((ctx) => ctx.db.insert('feeds', oldFeed(userId, {})));

    await t.mutation(internal.migrations.moveFeedSchedules, {});
    const afterFirst = await t.run((ctx) => ctx.db.query('feeds').collect());
    await t.mutation(internal.migrations.moveFeedSchedules, {});

    // The second run rewrites nothing, so no open chip row re-runs.
    expect(await t.run((ctx) => ctx.db.query('feeds').collect())).toEqual(afterFirst);
    const schedules = await t.run((ctx) => ctx.db.query('feedSchedules').collect());
    expect(schedules).toHaveLength(1);
    expect(schedules[0]).toMatchObject({ nextFetchAt: 0, failures: 0 });
  });
});

test('more Feeds than one batch are all moved, across scheduled runs', async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert('users', { email: 'a@example.com' }));
  await t.run(async (ctx) => {
    for (let i = 0; i < 230; i++) {
      await ctx.db.insert('feeds', { userId, url: `https://f${i}.example.com/feed`, title: `F${i}`, nextFetchAt: i });
    }
  });

  await t.mutation(internal.migrations.moveFeedSchedules, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);

  const schedules = await t.run((ctx) => ctx.db.query('feedSchedules').collect());
  expect(schedules).toHaveLength(230);
  expect(new Set(schedules.map((s) => s.nextFetchAt)).size).toBe(230);
});

test("an add that finishes after its Account was deleted stores nothing (P18)", async () => {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert('users', { email: 'a@example.com' }));
  await t.run((ctx) => ctx.db.delete(userId));

  await t.mutation(internal.feeds.store, { userId, url: 'https://late.example.com/feed', title: 'Late', articles: [], now: START });

  expect(await t.run((ctx) => ctx.db.query('feeds').collect())).toEqual([]);
  expect(await t.run((ctx) => ctx.db.query('feedSchedules').collect())).toEqual([]);
});
