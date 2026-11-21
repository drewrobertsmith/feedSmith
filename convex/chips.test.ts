/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import schema from './schema';

vi.mock('@convex-dev/auth/server', async (original) => ({
  ...(await original<typeof import('@convex-dev/auth/server')>()),
  getAuthUserId: async (ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) =>
    (await ctx.auth.getUserIdentity())?.subject ?? null,
}));

const modules = import.meta.glob('./**/*.ts');
const NOW = Date.UTC(2026, 10, 21, 12);
const HOUR = 3_600_000;

/** User A follows these Feeds, each with one Article published `ago` before NOW. */
async function setup(feeds: { title: string; ago: number }[]) {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const a = await ctx.db.insert('users', { email: 'a@example.com' });
    const b = await ctx.db.insert('users', { email: 'b@example.com' });
    const feedIds: Id<'feeds'>[] = [];
    for (const [i, { title, ago }] of feeds.entries()) {
      const feedId = await ctx.db.insert('feeds', {
        userId: a,
        url: `https://f${i}.example.com/feed`,
        title,
        siteUrl: `https://f${i}.example.com`,
      });
      await ctx.db.insert('articles', { userId: a, feedId, guid: `g${i}`, title: `${title} news`, publishedAt: NOW - ago });
      feedIds.push(feedId);
    }
    return { a, b, feedIds };
  });
  return { t, a: t.withIdentity({ subject: ids.a }), b: t.withIdentity({ subject: ids.b }), feedIds: ids.feedIds };
}

const titles = async (s: Awaited<ReturnType<typeof setup>>) => (await s.a.query(api.feeds.chips, {})).map((c) => c.title);

describe('chip order (P9)', () => {
  test('without Pins, Feeds come by their newest Article', async () => {
    const s = await setup([
      { title: 'Old', ago: 30 * HOUR },
      { title: 'New', ago: HOUR },
      { title: 'Middle', ago: 5 * HOUR },
    ]);
    expect(await titles(s)).toEqual(['New', 'Middle', 'Old']);
  });

  test('Pinned Feeds come first, in the order they were Pinned, then the rest by newest', async () => {
    const s = await setup([
      { title: 'Old', ago: 30 * HOUR },
      { title: 'New', ago: HOUR },
      { title: 'Middle', ago: 5 * HOUR },
      { title: 'Quiet', ago: 100 * HOUR },
    ]);
    const [old, , , quiet] = s.feedIds;
    expect(await s.a.mutation(api.feeds.setPinned, { id: quiet, pinned: true })).toEqual({ ok: true });
    expect(await s.a.mutation(api.feeds.setPinned, { id: old, pinned: true })).toEqual({ ok: true });
    expect(await titles(s)).toEqual(['Quiet', 'Old', 'New', 'Middle']);
    const chips = await s.a.query(api.feeds.chips, {});
    expect(chips.map((c) => c.pinned)).toEqual([true, true, false, false]);
    expect(chips[0]).toMatchObject({ faviconUrl: 'https://f3.example.com/favicon.ico' });
  });

  test('unpinning puts a Feed back among the rest', async () => {
    const s = await setup([
      { title: 'Old', ago: 30 * HOUR },
      { title: 'New', ago: HOUR },
    ]);
    await s.a.mutation(api.feeds.setPinned, { id: s.feedIds[0], pinned: true });
    await s.a.mutation(api.feeds.setPinned, { id: s.feedIds[0], pinned: false });
    expect(await titles(s)).toEqual(['New', 'Old']);
  });

  test('a fourth Pin is refused, and nothing changes', async () => {
    const s = await setup(['A', 'B', 'C', 'D'].map((title, i) => ({ title, ago: (i + 1) * HOUR })));
    for (const id of s.feedIds.slice(0, 3)) await s.a.mutation(api.feeds.setPinned, { id, pinned: true });
    expect(await s.a.mutation(api.feeds.setPinned, { id: s.feedIds[3], pinned: true })).toEqual({ ok: false, reason: 'pins-full' });
    expect((await s.a.query(api.feeds.chips, {})).filter((c) => c.pinned)).toHaveLength(3);
  });

  test('pinning a Pinned Feed again keeps its place', async () => {
    const s = await setup([
      { title: 'A', ago: HOUR },
      { title: 'B', ago: 2 * HOUR },
    ]);
    await s.a.mutation(api.feeds.setPinned, { id: s.feedIds[1], pinned: true });
    await s.a.mutation(api.feeds.setPinned, { id: s.feedIds[0], pinned: true });
    await s.a.mutation(api.feeds.setPinned, { id: s.feedIds[1], pinned: true });
    expect(await titles(s)).toEqual(['B', 'A']);
  });
});

describe("each User's own Feeds (Q10)", () => {
  test("another User sees no chips, can't Pin A's Feed, and can't read its Articles", async () => {
    const s = await setup([{ title: 'A', ago: HOUR }]);
    expect(await s.b.query(api.feeds.chips, {})).toEqual([]);
    expect(await s.b.mutation(api.feeds.setPinned, { id: s.feedIds[0], pinned: true })).toEqual({ ok: false, reason: 'not-found' });
    expect(await s.b.query(api.articles.all, { feedId: s.feedIds[0] })).toEqual([]);
    expect((await s.a.query(api.feeds.chips, {}))[0].pinned).toBe(false);
  });

  test('a malformed Feed id is nothing', async () => {
    const s = await setup([{ title: 'A', ago: HOUR }]);
    expect(await s.a.mutation(api.feeds.setPinned, { id: 'nope', pinned: true })).toEqual({ ok: false, reason: 'not-found' });
    expect(await s.a.query(api.articles.all, { feedId: 'x'.repeat(5000) })).toEqual([]);
  });

  test('signed out, chips and Pinning are refused', async () => {
    const s = await setup([{ title: 'A', ago: HOUR }]);
    await expect(s.t.query(api.feeds.chips, {})).rejects.toThrow(/SIGNED_OUT/);
    await expect(s.t.mutation(api.feeds.setPinned, { id: s.feedIds[0], pinned: true })).rejects.toThrow(/SIGNED_OUT/);
  });

  test('no chip carries a feed URL (Q9)', async () => {
    const s = await setup([{ title: 'A', ago: HOUR }]);
    expect(JSON.stringify(await s.a.query(api.feeds.chips, {}))).not.toContain('/feed');
  });
});

describe("one Feed's Articles (P5)", () => {
  test('All with a Feed shows only that Feed, newest first; without one, everything', async () => {
    const s = await setup([
      { title: 'A', ago: HOUR },
      { title: 'B', ago: 2 * HOUR },
    ]);
    expect((await s.a.query(api.articles.all, { feedId: s.feedIds[1] })).map((r) => r.title)).toEqual(['B news']);
    expect((await s.a.query(api.articles.all, {})).map((r) => r.title)).toEqual(['A news', 'B news']);
  });
});

describe('more Feeds than the row shows (P9)', () => {
  test('Pinned Feeds and the Pin limit hold past the first 200', async () => {
    const s = await setup([]);
    const ids = await s.t.run(async (ctx) => {
      const user = (await ctx.db.query('users').first())!._id;
      const out: Id<'feeds'>[] = [];
      for (let i = 0; i < 210; i++)
        out.push(await ctx.db.insert('feeds', { userId: user, url: `https://z${String(i).padStart(3, '0')}.example.com/feed`, title: `F${i}` }));
      return out;
    });
    // The last three by URL order are Pinned: they sort after the first 200.
    for (const id of ids.slice(-3)) expect(await s.a.mutation(api.feeds.setPinned, { id, pinned: true })).toEqual({ ok: true });
    expect(await s.a.mutation(api.feeds.setPinned, { id: ids[0], pinned: true })).toEqual({ ok: false, reason: 'pins-full' });
    expect((await s.a.query(api.feeds.chips, {})).slice(0, 3).map((c) => c.title)).toEqual(['F207', 'F208', 'F209']);
  });
});

describe('icons', () => {
  test("a site address ending in / still makes one favicon address", async () => {
    const s = await setup([{ title: 'A', ago: HOUR }]);
    await s.t.run((ctx) => ctx.db.patch(s.feedIds[0], { siteUrl: 'https://f0.example.com/' }));
    expect((await s.a.query(api.feeds.chips, {}))[0].faviconUrl).toBe('https://f0.example.com/favicon.ico');
  });
});
