/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { runScheduledNow } from '../test/convex-scheduled';

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
const HOUR = 60 * MINUTE;
const START = Date.UTC(2026, 10, 21, 12);

const rss = () =>
  `<rss version="2.0"><channel><title>Example</title><link>https://example.com/</link><item><title>one</title><guid>one</guid><pubDate>${new Date(
    Date.now() - HOUR,
  ).toUTCString()}</pubDate></item></channel></rss>`;

const network = vi.fn<(url: string) => Promise<Response>>();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
  network.mockReset();
  network.mockImplementation(async () => new Response(rss()));
  vi.stubGlobal('fetch', (url: string) => network(url));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function setup() {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert('users', { email: 'a@example.com' }));
  return { t, userId, asA: t.withIdentity({ subject: userId }) };
}

/** Every run of the fetch scheduler still waiting to happen, by when. */
const pendingTicks = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) =>
    (await ctx.db.system.query('_scheduled_functions').collect())
      .filter((job) => job.name.includes('scheduleDue') && job.state.kind === 'pending')
      .map((job) => job.scheduledTime),
  );

/** When each Feed is next due. */
const dueTimes = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => (await ctx.db.query('feedSchedules').collect()).map((schedule) => schedule.nextFetchAt));

describe('the fetch scheduler sleeps until a Feed is due (FEE-55)', () => {
  test('with no Feeds anywhere, nothing is booked, even after the safety check', async () => {
    const { t } = await setup();
    await t.mutation(internal.refresh.ensureFetchTimer, {});
    expect(await pendingTicks(t)).toEqual([]);
  });

  test('adding a Feed books one run, at the time it falls due', async () => {
    const { t, asA } = await setup();
    await asA.action(api.feeds.add, { url: 'https://a.example.com/feed' });

    expect(await pendingTicks(t)).toEqual(await dueTimes(t));
  });

  test('the run fetches the Feed when it falls due, then books the next one', async () => {
    const { t, asA } = await setup();
    await asA.action(api.feeds.add, { url: 'https://a.example.com/feed' });
    const [due] = await dueTimes(t);
    network.mockClear();

    vi.setSystemTime(due);
    await t.finishInProgressScheduledFunctions();
    await vi.advanceTimersByTimeAsync(0);
    await t.mutation(internal.refresh.scheduleDue, {});
    await runScheduledNow(t);

    expect(network).toHaveBeenCalled();
    // The run booked for `due` is the one this stands in for, so it's left alone; one is booked after it.
    const ticks = (await pendingTicks(t)).filter((time) => time > due);
    expect(ticks).toHaveLength(1);
  });

  test('a Feed due sooner brings the run forward; there is never more than one', async () => {
    const { t, userId, asA } = await setup();
    await asA.action(api.feeds.add, { url: 'https://a.example.com/feed' });
    const [later] = await dueTimes(t);

    // A second Feed falls due sooner: its first check writes its schedule.
    const feedId = await t.run((ctx) => ctx.db.insert('feeds', { userId, url: 'https://b.example.com/feed', title: 'B' }));
    await t.mutation(internal.refresh.recordFailure, { feedId, now: START, reason: 'unreachable' });

    const ticks = await pendingTicks(t);
    expect(ticks).toHaveLength(1);
    expect(ticks[0]).toBeLessThan(later);
  });

  test('a Feed due later never moves the run, so fetch results never fight over it', async () => {
    const { t, asA } = await setup();
    await asA.action(api.feeds.add, { url: 'https://a.example.com/feed' });
    const before = await pendingTicks(t);
    const feedId = await t.run(async (ctx) => (await ctx.db.query('feeds').first())!._id as Id<'feeds'>);

    // A check that pushes the Feed further out leaves the booked run where it is.
    await t.mutation(internal.refresh.recordNotModified, { feedId, now: START + MINUTE });

    expect(await pendingTicks(t)).toEqual(before);
  });

  test('removing the last Feed leaves at most one run, which books nothing after it', async () => {
    const { t, asA } = await setup();
    await asA.action(api.feeds.add, { url: 'https://a.example.com/feed' });
    const feedId = await t.run(async (ctx) => (await ctx.db.query('feeds').first())!._id);
    await asA.mutation(api.feeds.remove, { id: feedId });

    await t.mutation(internal.refresh.scheduleDue, {});

    expect(await pendingTicks(t)).toEqual([]);
  });

  test('the safety check books the run again when it was lost', async () => {
    const { t, asA } = await setup();
    await asA.action(api.feeds.add, { url: 'https://a.example.com/feed' });
    // A lost run: cancelled, as a failed deploy or a crash might leave it.
    await t.run(async (ctx) => {
      for (const job of await ctx.db.system.query('_scheduled_functions').collect()) {
        if (job.state.kind === 'pending') await ctx.scheduler.cancel(job._id);
      }
    });
    expect(await pendingTicks(t)).toEqual([]);

    await t.mutation(internal.refresh.ensureFetchTimer, {});

    expect(await pendingTicks(t)).toEqual(await dueTimes(t));
  });

  test('the safety check never adds a second run when one is booked', async () => {
    const { t, asA } = await setup();
    await asA.action(api.feeds.add, { url: 'https://a.example.com/feed' });

    await t.mutation(internal.refresh.ensureFetchTimer, {});
    await t.mutation(internal.refresh.ensureFetchTimer, {});

    expect(await pendingTicks(t)).toHaveLength(1);
  });
});

test("a run never cancels itself: in production a running mutation's own job still reads as pending", async () => {
  const { t, asA } = await setup();
  await asA.action(api.feeds.add, { url: 'https://a.example.com/feed' });
  const [due] = await dueTimes(t);
  const booked = await t.run(async (ctx) => (await ctx.db.query('fetchTimer').first())!.scheduledId);

  // Its time has come, but its job hasn't started: exactly how the run sees itself in production.
  vi.setSystemTime(due + 1);
  await t.mutation(internal.refresh.scheduleDue, {});

  const job = await t.run((ctx) => ctx.db.system.get(booked));
  expect(job!.state.kind).not.toBe('canceled');
  // The next run is booked for after the lease, and it is the only one in the future.
  const future = (await pendingTicks(t)).filter((time) => time > due + 1);
  expect(future).toHaveLength(1);
});

test("a schedule written while the run is due doesn't book a second one", async () => {
  const { t, userId, asA } = await setup();
  await asA.action(api.feeds.add, { url: 'https://a.example.com/feed' });
  const [due] = await dueTimes(t);
  vi.setSystemTime(due + 1);

  // A second Feed's check lands while the booked run is due but hasn't started.
  const feedId = await t.run((ctx) => ctx.db.insert('feeds', { userId, url: 'https://b.example.com/feed', title: 'B' }));
  await t.mutation(internal.refresh.recordFailure, { feedId, now: due + 1, reason: 'unreachable' });

  expect(await pendingTicks(t)).toHaveLength(1);
});
