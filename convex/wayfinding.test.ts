/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import schema from './schema';

vi.mock('@convex-dev/auth/server', async (original) => ({
  ...(await original<typeof import('@convex-dev/auth/server')>()),
  getAuthUserId: async (ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) =>
    (await ctx.auth.getUserIdentity())?.subject ?? null,
}));

const modules = import.meta.glob('./**/*.ts');

const MINUTE = 60_000;
const START = Date.UTC(2026, 10, 21, 12);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(START);
});
afterEach(() => vi.useRealTimers());

/** Users A and B; A follows two Feeds fetched at different times, B follows one. */
async function setup() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const a = await ctx.db.insert('users', { email: 'a@example.com' });
    const b = await ctx.db.insert('users', { email: 'b@example.com' });
    const feed = async (userId: typeof a, title: string, lastFetchedAt?: number) => {
      const feedId = await ctx.db.insert('feeds', { userId, url: `https://${title}.example.com/feed`, title });
      await ctx.db.insert('feedSchedules', { feedId, userId, nextFetchAt: START + 60 * MINUTE, failures: 0, lastFetchedAt });
      return feedId;
    };
    const verge = await feed(a, 'verge', START - 30 * MINUTE);
    await feed(a, 'calm', START - 5 * MINUTE);
    await feed(b, 'other', START - MINUTE);
    const articleId = await ctx.db.insert('articles', { userId: a, feedId: verge, guid: 'g1', title: 'One', publishedAt: START });
    await ctx.db.insert('articleBodies', { userId: a, articleId, blocks: [], omitted: [] });
    return { a, b, verge, articleId };
  });
  return { t, ...ids, asA: t.withIdentity({ subject: ids.a }), asB: t.withIdentity({ subject: ids.b }) };
}

describe('when All was last updated (FEE-47)', () => {
  test("is the newest fetch across the User's own Feeds", async () => {
    const { asA } = await setup();
    expect(await asA.query(api.feeds.lastUpdated, {})).toBe(START - 5 * MINUTE);
  });

  test("never reflects another User's Feeds (Q10)", async () => {
    const { asB } = await setup();
    expect(await asB.query(api.feeds.lastUpdated, {})).toBe(START - MINUTE);
  });

  test('is nothing for a User with no Feeds, or Feeds never fetched yet', async () => {
    const { t } = await setup();
    const c = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { email: 'c@example.com' });
      const feedId = await ctx.db.insert('feeds', { userId, url: 'https://new.example.com/feed', title: 'New' });
      await ctx.db.insert('feedSchedules', { feedId, userId, nextFetchAt: 0, failures: 0 });
      return userId;
    });
    const d = await t.run((ctx) => ctx.db.insert('users', { email: 'd@example.com' }));
    expect(await t.withIdentity({ subject: c }).query(api.feeds.lastUpdated, {})).toBeNull();
    expect(await t.withIdentity({ subject: d }).query(api.feeds.lastUpdated, {})).toBeNull();
  });

  test('is refused signed out (Q10)', async () => {
    const { t } = await setup();
    await expect(t.query(api.feeds.lastUpdated, {})).rejects.toThrow(/SIGNED_OUT/);
  });
});

test("an Article names its Feed by id, so the Reading view can link to it (FEE-47)", async () => {
  const { asA, asB, verge, articleId } = await setup();
  expect(await asA.query(api.articles.get, { id: articleId })).toMatchObject({ feedId: verge, feedTitle: 'verge' });
  expect(await asB.query(api.articles.get, { id: articleId })).toBeNull();
});
