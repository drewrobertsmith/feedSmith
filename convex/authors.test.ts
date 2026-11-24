/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import schema from './schema';

vi.mock('@convex-dev/auth/server', async (original) => ({
  ...(await original<typeof import('@convex-dev/auth/server')>()),
  getAuthUserId: async (ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) =>
    (await ctx.auth.getUserIdentity())?.subject ?? null,
}));

const modules = import.meta.glob('./**/*.ts');
const NOW = Date.UTC(2026, 10, 21, 12);
const FEED = 'https://notes.example.com/feed';

/** One full-text Article, credited to `creators` (none when empty). */
const rss = (creators: string[]) =>
  `<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Notes</title><link>https://notes.example.com/</link>` +
  `<item><title>Slow reading</title><guid>g1</guid><pubDate>${new Date(NOW - 60_000).toUTCString()}</pubDate>` +
  creators.map((name) => `<dc:creator>${name}</dc:creator>`).join('') +
  `<content:encoded><![CDATA[<p>Text.</p>]]></content:encoded></item></channel></rss>`;

let body = '';
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.stubGlobal('fetch', async (url: string) =>
    url === FEED ? new Response(body) : new Response('', { status: 404 }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function follow(creators: string[]) {
  const t = convexTest(schema, modules);
  const userId = await t.run((ctx) => ctx.db.insert('users', { email: 'a@example.com' }));
  const owner = t.withIdentity({ subject: userId });
  body = rss(creators);
  expect(await owner.action(api.feeds.add, { url: FEED })).toMatchObject({ ok: true });
  const feedId = await t.run(async (ctx) => (await ctx.db.query('feeds').first())!._id);
  const articleId = await t.run(async (ctx) => (await ctx.db.query('articles').first())!._id);
  return { t, owner, feedId, articleId };
}

describe("an Article's authors (FEE-41)", () => {
  test('are stored, and both All and the Reading view return them', async () => {
    const s = await follow(['Emma Roth', 'Jay Peters']);
    expect((await s.owner.query(api.articles.all, {}))[0]).toMatchObject({ authors: ['Emma Roth', 'Jay Peters'] });
    expect(await s.owner.query(api.articles.get, { id: s.articleId })).toMatchObject({ authors: ['Emma Roth', 'Jay Peters'] });
  });

  test('an Article credited to nobody has no authors', async () => {
    const s = await follow([]);
    expect((await s.owner.query(api.articles.all, {}))[0]).not.toHaveProperty('authors');
  });

  test('an Article stored before authors were kept gains them on its next fetch', async () => {
    const s = await follow([]);
    body = rss(['Emma Roth']);
    await s.t.action(internal.refresh.refreshFeed, { feedId: s.feedId });
    expect(await s.owner.query(api.articles.get, { id: s.articleId })).toMatchObject({ authors: ['Emma Roth'] });
  });
});
