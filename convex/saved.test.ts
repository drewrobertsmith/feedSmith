/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { runScheduledNow } from '../test/convex-scheduled';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import rateLimiterTest from '@convex-dev/rate-limiter/test';
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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});
afterEach(() => vi.useRealTimers());

/** User A follows The Verge with three Articles; User B follows one Feed with one. */
async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const ids = await t.run(async (ctx) => {
    const a = await ctx.db.insert('users', { email: 'a@example.com' });
    const b = await ctx.db.insert('users', { email: 'b@example.com' });
    const verge = await ctx.db.insert('feeds', {
      userId: a,
      url: 'https://www.theverge.com/rss/full.xml',
      title: 'The Verge',
      siteUrl: 'https://www.theverge.com',
    });
    const other = await ctx.db.insert('feeds', { userId: b, url: 'https://b.example.com/feed', title: 'B' });
    const article = async (userId: Id<'users'>, feedId: Id<'feeds'>, guid: string, publishedAt: number) => {
      const articleId = await ctx.db.insert('articles', { userId, feedId, guid, title: guid, publishedAt });
      await ctx.db.insert('articleBodies', { userId, articleId, blocks: [], omitted: [] });
      return articleId;
    };
    return {
      a,
      b,
      verge,
      one: await article(a, verge, 'one', START - 3 * DAY),
      two: await article(a, verge, 'two', START - 2 * DAY),
      three: await article(a, verge, 'three', START - DAY),
      theirs: await article(b, other, 'theirs', START),
    };
  });
  return { t, ...ids, asA: t.withIdentity({ subject: ids.a }), asB: t.withIdentity({ subject: ids.b }) };
}

/**
 * Five Articles newer than any other in The Verge: the cleanup keeps each Feed's five newest, whatever
 * their age (FEE-93), so these make the older ones fair game for it.
 */
const fiveNewer = (t: Awaited<ReturnType<typeof setup>>['t'], userId: Id<'users'>, feedId: Id<'feeds'>) =>
  t.run(async (ctx) => {
    for (let i = 0; i < 5; i += 1) await ctx.db.insert('articles', { userId, feedId, guid: `newer${i}`, title: 'newer', publishedAt: START + i });
  });

describe('Saving an Article (Q3)', () => {
  test('puts it in Saved, most recently Saved first', async () => {
    const { asA, one, two, three } = await setup();
    await asA.mutation(api.articles.save, { id: two });
    vi.setSystemTime(START + MINUTE);
    await asA.mutation(api.articles.save, { id: one });
    vi.setSystemTime(START + 2 * MINUTE);
    await asA.mutation(api.articles.save, { id: three });

    const saved = await asA.query(api.articles.saved, {});
    expect(saved.map((row) => row.id)).toEqual([three, one, two]);
    expect(saved[0]).toMatchObject({ title: 'three', feedTitle: 'The Verge', saved: true });
  });

  test('marks it Saved in All and in its Reading view', async () => {
    const { asA, one, two } = await setup();
    await asA.mutation(api.articles.save, { id: one });

    const all = await asA.query(api.articles.all, {});
    expect(all.find((row) => row.id === one)?.saved).toBe(true);
    expect(all.find((row) => row.id === two)?.saved).toBe(false);
    expect(await asA.query(api.articles.get, { id: one })).toMatchObject({ saved: true });
  });

  test('saving one already Saved keeps its place', async () => {
    const { asA, one, two } = await setup();
    await asA.mutation(api.articles.save, { id: one });
    vi.setSystemTime(START + MINUTE);
    await asA.mutation(api.articles.save, { id: two });
    vi.setSystemTime(START + 2 * MINUTE);
    await asA.mutation(api.articles.save, { id: one });

    expect((await asA.query(api.articles.saved, {})).map((row) => row.id)).toEqual([two, one]);
  });
});

describe('Done (P8)', () => {
  test('takes it out of Saved; it stays in its Feed as Read', async () => {
    const { asA, one } = await setup();
    await asA.mutation(api.articles.save, { id: one });
    await asA.mutation(api.articles.done, { id: one });

    expect(await asA.query(api.articles.saved, {})).toEqual([]);
    const row = (await asA.query(api.articles.all, {})).find((r) => r.id === one);
    expect(row).toMatchObject({ saved: false, read: true });
  });
});

describe('Undo (Q35)', () => {
  test('undoing a Save takes it back out of Saved, as it was', async () => {
    const { asA, one } = await setup();
    const before = await asA.mutation(api.articles.save, { id: one });
    await asA.mutation(api.articles.restore, { id: one, ...before });

    expect(await asA.query(api.articles.saved, {})).toEqual([]);
    expect((await asA.query(api.articles.all, {})).find((r) => r.id === one)).toMatchObject({ saved: false, read: false });
  });

  test('undoing Done puts it back in its old place in Saved, and Unread if it was', async () => {
    const { asA, one, two } = await setup();
    await asA.mutation(api.articles.save, { id: one });
    vi.setSystemTime(START + MINUTE);
    await asA.mutation(api.articles.save, { id: two });
    vi.setSystemTime(START + 2 * MINUTE);
    const before = await asA.mutation(api.articles.done, { id: one });
    await asA.mutation(api.articles.restore, { id: one, ...before });

    expect((await asA.query(api.articles.saved, {})).map((row) => row.id)).toEqual([two, one]);
    expect((await asA.query(api.articles.all, {})).find((r) => r.id === one)?.read).toBe(false);
  });

  test('ignores a time that is no time at all', async () => {
    const { t, asA, one } = await setup();
    for (const bad of [Number.NaN, -1, 0, Number.NEGATIVE_INFINITY]) {
      await asA.mutation(api.articles.restore, { id: one, savedAt: bad, readAt: bad });
      const article = await t.run((ctx) => ctx.db.get(one));
      expect(article!.savedAt).toBeUndefined();
      expect(article!.readAt).toBeUndefined();
    }
  });

  test('never sets a time in the future', async () => {
    const { t, asA, one } = await setup();
    await asA.mutation(api.articles.restore, { id: one, savedAt: START + DAY, readAt: START + DAY });
    const article = await t.run((ctx) => ctx.db.get(one));
    expect(article!.savedAt).toBeLessThanOrEqual(START);
    expect(article!.readAt).toBeLessThanOrEqual(START);
  });
});

describe('only the signed-in User, only their own Articles (Q10)', () => {
  test('signed out, every Saved function is refused', async () => {
    const { t, one } = await setup();
    await expect(t.query(api.articles.saved, {})).rejects.toThrow(/SIGNED_OUT/);
    await expect(t.mutation(api.articles.save, { id: one })).rejects.toThrow(/SIGNED_OUT/);
    await expect(t.mutation(api.articles.done, { id: one })).rejects.toThrow(/SIGNED_OUT/);
    await expect(t.mutation(api.articles.restore, { id: one })).rejects.toThrow(/SIGNED_OUT/);
  });

  test("another User's Article can't be Saved, Done or restored, and never shows in Saved", async () => {
    const { t, asA, asB, one, theirs } = await setup();
    await asB.mutation(api.articles.save, { id: theirs });

    await asA.mutation(api.articles.save, { id: theirs });
    await asA.mutation(api.articles.done, { id: theirs });
    await asA.mutation(api.articles.restore, { id: theirs });
    await asB.mutation(api.articles.save, { id: one });

    const [mine, them] = await t.run(async (ctx) => [await ctx.db.get(one), await ctx.db.get(theirs)]);
    expect(mine!.savedAt).toBeUndefined();
    expect(them!.savedAt).toBe(START);
    expect(them!.readAt).toBeUndefined();
    expect(await asA.query(api.articles.saved, {})).toEqual([]);
  });

  test('a link that names no Article does nothing', async () => {
    const { asA } = await setup();
    for (const id of ['', 'nope', 'x'.repeat(5000)]) {
      await expect(asA.mutation(api.articles.save, { id })).resolves.toBeNull();
      await expect(asA.mutation(api.articles.done, { id })).resolves.toBeNull();
    }
  });
});

describe('what you Saved is never lost (P14, T23)', () => {
  test('the 30-day cleanup keeps a Saved Article until it is Done', async () => {
    const { t, asA, a, verge, one, two } = await setup();
    await fiveNewer(t, a, verge);
    await asA.mutation(api.articles.save, { id: one });
    vi.setSystemTime(START + 40 * DAY);

    await t.mutation(internal.refresh.cleanup, {});
    await runScheduledNow(t);
    expect(await t.run((ctx) => ctx.db.get(one))).not.toBeNull();
    expect(await t.run((ctx) => ctx.db.get(two))).toBeNull();

    await asA.mutation(api.articles.done, { id: one });
    await t.mutation(internal.refresh.cleanup, {});
    await runScheduledNow(t);
    expect(await t.run((ctx) => ctx.db.get(one))).toBeNull();
  });

  test('the cleanup gets past a full batch of old Saved Articles', async () => {
    const { t, a, verge } = await setup();
    await fiveNewer(t, a, verge);
    const unsaved = await t.run(async (ctx) => {
      for (let i = 0; i < 120; i += 1) {
        await ctx.db.insert('articles', { userId: a, feedId: verge, guid: `s${i}`, title: 's', publishedAt: START - 60 * DAY, savedAt: START });
      }
      return ctx.db.insert('articles', { userId: a, feedId: verge, guid: 'old', title: 'old', publishedAt: START - 50 * DAY });
    });
    await t.mutation(internal.refresh.cleanup, {});
    await runScheduledNow(t);
    expect(await t.run((ctx) => ctx.db.get(unsaved))).toBeNull();
  });

  test('removing a Feed keeps its Saved Articles in Saved, still named by it', async () => {
    const { t, asA, verge, one, two } = await setup();
    await asA.mutation(api.articles.save, { id: one });
    await asA.mutation(api.feeds.remove, { id: verge });
    await runScheduledNow(t);

    expect(await t.run((ctx) => ctx.db.get(two))).toBeNull();
    const saved = await asA.query(api.articles.saved, {});
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ id: one, feedTitle: 'The Verge', saved: true });
    expect(saved[0].feedId).toBeUndefined();
    // Still readable, with nowhere to link its Feed to.
    const reading = await asA.query(api.articles.get, { id: one });
    expect(reading).toMatchObject({ title: 'one', feedTitle: 'The Verge', saved: true });
    expect(reading!.feedId).toBeUndefined();
    // Not in All: its Feed is gone.
    expect(await asA.query(api.articles.all, {})).toEqual([]);
  });

  test("an Article of a Feed being removed can't be Saved or put back into Saved: it would have no name", async () => {
    const { t, asA, verge, one, two } = await setup();
    await asA.mutation(api.articles.save, { id: two });
    const before = await asA.mutation(api.articles.done, { id: two });
    // The Feed goes; its Articles are deleted in batches after, so a stale screen can still reach them.
    await asA.mutation(api.feeds.remove, { id: verge });

    expect(await asA.mutation(api.articles.save, { id: one })).toBeNull();
    await asA.mutation(api.articles.restore, { id: two, ...before! });
    expect(await asA.query(api.articles.saved, {})).toEqual([]);

    await runScheduledNow(t);
    expect(await t.run((ctx) => ctx.db.get(one))).toBeNull();
    expect(await t.run((ctx) => ctx.db.get(two))).toBeNull();
  });

  test("removing a Feed names every one of its Saved Articles, however many, a batch at a time", async () => {
    const { t, a, asA, verge } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 250; i += 1) {
        await ctx.db.insert('articles', { userId: a, feedId: verge, guid: `k${i}`, title: 'k', publishedAt: START, savedAt: START - i });
      }
    });
    await asA.mutation(api.feeds.remove, { id: verge });
    await runScheduledNow(t);
    const saved = await asA.query(api.articles.saved, {});
    expect(saved).toHaveLength(250);
    expect(saved.every((row) => row.feedTitle === 'The Verge')).toBe(true);
  });

  test("once Done, a removed Feed's Saved Article is gone from view, and the cleanup deletes it", async () => {
    const { t, asA, verge, one } = await setup();
    await asA.mutation(api.articles.save, { id: one });
    await asA.mutation(api.feeds.remove, { id: verge });
    await runScheduledNow(t);

    // Undo still has it to put back until the cleanup comes round.
    await asA.mutation(api.articles.done, { id: one });
    expect(await asA.query(api.articles.saved, {})).toEqual([]);
    expect(await asA.query(api.articles.get, { id: one })).toBeNull();

    vi.setSystemTime(START + 40 * DAY);
    await t.mutation(internal.refresh.cleanup, {});
    await runScheduledNow(t);
    expect(await t.run((ctx) => ctx.db.get(one))).toBeNull();
  });
});
