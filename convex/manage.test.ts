/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

vi.mock('@convex-dev/auth/server', async (original) => ({
  ...(await original<typeof import('@convex-dev/auth/server')>()),
  getAuthUserId: async (ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) =>
    (await ctx.auth.getUserIdentity())?.subject ?? null,
}));

const modules = import.meta.glob('./**/*.ts');

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());
const NOW = Date.UTC(2026, 10, 21, 12);

async function setup(titles: string[], articlesEach = 2) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const a = await ctx.db.insert('users', { email: 'a@example.com' });
    const b = await ctx.db.insert('users', { email: 'b@example.com' });
    const feedIds: Id<'feeds'>[] = [];
    for (const [i, title] of titles.entries()) {
      const feedId = await ctx.db.insert('feeds', {
        userId: a,
        url: `https://feeds${i}.example.com/private/rss.xml?key=SECRET${i}`,
        title,
        siteUrl: `https://site${i}.example.com`,
      });
      for (let j = 0; j < articlesEach; j++) {
        const articleId = await ctx.db.insert('articles', { userId: a, feedId, guid: `g${i}-${j}`, title: `${title} ${j}`, publishedAt: NOW - j });
        await ctx.db.insert('articleBodies', { userId: a, articleId, blocks: [], omitted: [] });
      }
      feedIds.push(feedId);
    }
    return { a, b, feedIds };
  });
  return { t, a: t.withIdentity({ subject: ids.a }), b: t.withIdentity({ subject: ids.b }), feedIds: ids.feedIds };
}

describe('the Manage Feeds list (D13)', () => {
  test('every Feed with its icon, name and host: Pinned first in order, then by name', async () => {
    const s = await setup(['Zeta', 'alpha', 'Mid']);
    await s.a.mutation(api.feeds.setPinned, { id: s.feedIds[2], pinned: true });
    const list = await s.a.query(api.feeds.manage, {});
    expect(list.map((f) => f.title)).toEqual(['Mid', 'alpha', 'Zeta']);
    expect(list[0]).toMatchObject({ pinned: true, host: 'site2.example.com', faviconUrl: 'https://site2.example.com/favicon.ico', working: true });
  });

  test("shows the site's host; a Feed with no site falls back to the feed's host (D13)", async () => {
    const s = await setup(['Has site', 'No site']);
    await s.t.run((ctx) => ctx.db.patch(s.feedIds[1], { siteUrl: undefined }));
    const hosts = Object.fromEntries((await s.a.query(api.feeds.manage, {})).map((f) => [f.title, f.host]));
    expect(hosts).toEqual({ 'Has site': 'site0.example.com', 'No site': 'feeds1.example.com' });
  });

  test('never shows a feed URL in full (Q9)', async () => {
    const s = await setup(['A']);
    const text = JSON.stringify(await s.a.query(api.feeds.manage, {}));
    expect(text).not.toMatch(/SECRET|private|rss\.xml/);
  });

  test('a Feed that has stopped working says so, with when it was last tried (P15)', async () => {
    const s = await setup(['A']);
    await s.t.run((ctx) => ctx.db.patch(s.feedIds[0], { status: 'failing', failures: 3, lastFetchedAt: NOW }));
    expect((await s.a.query(api.feeds.manage, {}))[0]).toMatchObject({ working: false });
  });
});

describe('renaming a Feed', () => {
  test('changes its name everywhere: the list, its chip and its Articles', async () => {
    const s = await setup(['The Verge - Full RSS for subscribers | The Verge']);
    expect(await s.a.mutation(api.feeds.rename, { id: s.feedIds[0], title: '  The Verge  ' })).toEqual({ ok: true });
    expect((await s.a.query(api.feeds.manage, {}))[0].title).toBe('The Verge');
    expect((await s.a.query(api.feeds.chips, {}))[0].title).toBe('The Verge');
    expect((await s.a.query(api.articles.all, {}))[0].feedTitle).toBe('The Verge');
  });

  test.each([
    ['empty', '   '],
    ['too long', 'x'.repeat(101)],
  ])('an %s name is refused', async (_case, title) => {
    const s = await setup(['A']);
    expect(await s.a.mutation(api.feeds.rename, { id: s.feedIds[0], title })).toEqual({ ok: false, reason: 'invalid-name' });
    expect((await s.a.query(api.feeds.manage, {}))[0].title).toBe('A');
  });
});

describe('removing a Feed (T23)', () => {
  test('removes the Feed, its Articles and their bodies; other Feeds are untouched', async () => {
    const s = await setup(['Gone', 'Stays'], 3);
    expect(await s.a.mutation(api.feeds.remove, { id: s.feedIds[0] })).toEqual({ ok: true });
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await s.a.query(api.feeds.manage, {})).map((f) => f.title)).toEqual(['Stays']);
    expect((await s.a.query(api.articles.all, {})).map((r) => r.title)).toEqual(['Stays 0', 'Stays 1', 'Stays 2']);
    expect(await s.t.run((ctx) => ctx.db.query('articleBodies').take(100))).toHaveLength(3);
  });

  test("All never shows a removed Feed's Articles, even before they're all deleted", async () => {
    const s = await setup(['Gone'], 3);
    await s.a.mutation(api.feeds.remove, { id: s.feedIds[0] });
    expect(await s.a.query(api.articles.all, {})).toEqual([]);
  });

  test("a Feed with no name still shows its Articles; only a removed Feed's are hidden", async () => {
    const s = await setup(['', 'Gone'], 1);
    await s.a.mutation(api.feeds.remove, { id: s.feedIds[1] });
    expect((await s.a.query(api.articles.all, {})).map((row) => row.title)).toEqual([' 0']);
  });

  test("a link to a removed Feed's Article opens nothing, even before it's deleted", async () => {
    const s = await setup(['Gone'], 1);
    const [articleId] = await s.t.run(async (ctx) => (await ctx.db.query('articles').take(1)).map((a) => a._id));
    await s.a.mutation(api.feeds.remove, { id: s.feedIds[0] });
    expect(await s.a.query(api.articles.get, { id: articleId })).toBeNull();
  });

  test('a large Feed is removed in batches', async () => {
    const s = await setup(['Big'], 230);
    await s.a.mutation(api.feeds.remove, { id: s.feedIds[0] });
    await s.t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(await s.t.run((ctx) => ctx.db.query('articles').take(10))).toEqual([]);
    expect(await s.t.run((ctx) => ctx.db.query('articleBodies').take(10))).toEqual([]);
  });
});

describe('ordering the Pinned Feeds (P9)', () => {
  test('sets the order of the Pinned Feeds; the chip row follows', async () => {
    const s = await setup(['A', 'B', 'C']);
    for (const id of s.feedIds) await s.a.mutation(api.feeds.setPinned, { id, pinned: true });
    const [a, b, c] = s.feedIds;
    expect(await s.a.mutation(api.feeds.orderPins, { ids: [c, a, b] })).toEqual({ ok: true });
    expect((await s.a.query(api.feeds.chips, {})).map((f) => f.title)).toEqual(['C', 'A', 'B']);
    expect((await s.a.query(api.feeds.manage, {})).map((f) => f.title)).toEqual(['C', 'A', 'B']);
  });

  test('an order that is not exactly the Pinned Feeds is refused', async () => {
    const s = await setup(['A', 'B', 'C']);
    const [a, b, c] = s.feedIds;
    await s.a.mutation(api.feeds.setPinned, { id: a, pinned: true });
    await s.a.mutation(api.feeds.setPinned, { id: b, pinned: true });
    expect(await s.a.mutation(api.feeds.orderPins, { ids: [b, c] })).toEqual({ ok: false, reason: 'not-pinned' });
    expect(await s.a.mutation(api.feeds.orderPins, { ids: [b] })).toEqual({ ok: false, reason: 'not-pinned' });
    expect(await s.a.mutation(api.feeds.orderPins, { ids: [b, b] })).toEqual({ ok: false, reason: 'not-pinned' });
  });
});

describe("each User's own Feeds (Q10)", () => {
  test("another User can't see, rename, remove or order A's Feeds", async () => {
    const s = await setup(['A', 'B']);
    await s.a.mutation(api.feeds.setPinned, { id: s.feedIds[0], pinned: true });
    expect(await s.b.query(api.feeds.manage, {})).toEqual([]);
    expect(await s.b.mutation(api.feeds.rename, { id: s.feedIds[0], title: 'Mine' })).toEqual({ ok: false, reason: 'not-found' });
    expect(await s.b.mutation(api.feeds.remove, { id: s.feedIds[0] })).toEqual({ ok: false, reason: 'not-found' });
    expect(await s.b.mutation(api.feeds.orderPins, { ids: [s.feedIds[0]] })).toEqual({ ok: false, reason: 'not-pinned' });
    expect((await s.a.query(api.feeds.manage, {})).map((f) => f.title)).toEqual(['A', 'B']);
  });

  test('signed out, everything is refused', async () => {
    const s = await setup(['A']);
    await expect(s.t.query(api.feeds.manage, {})).rejects.toThrow(/SIGNED_OUT/);
    await expect(s.t.mutation(api.feeds.rename, { id: s.feedIds[0], title: 'x' })).rejects.toThrow(/SIGNED_OUT/);
    await expect(s.t.mutation(api.feeds.remove, { id: s.feedIds[0] })).rejects.toThrow(/SIGNED_OUT/);
    await expect(s.t.mutation(api.feeds.orderPins, { ids: [] })).rejects.toThrow(/SIGNED_OUT/);
  });
});
