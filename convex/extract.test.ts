/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import article from './lib/feed/fixtures/page-article.html?raw';
import index from './lib/feed/fixtures/page-index.html?raw';
import paywall from './lib/feed/fixtures/page-paywall.html?raw';
import schema from './schema';

vi.mock('@convex-dev/auth/server', async (original) => ({
  ...(await original<typeof import('@convex-dev/auth/server')>()),
  getAuthUserId: async (ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) =>
    (await ctx.auth.getUserIdentity())?.subject ?? null,
}));

const modules = import.meta.glob('./**/*.ts');
const NOW = Date.UTC(2026, 10, 21, 12);
const FEED = 'https://calmnotes.example/feed';
const SUBTITLE = 'Why reading slowly is worth it.';

type Item = { guid: string; link?: string; full?: boolean };

/** A summary-only RSS Feed (each item has just a description), unless `full` gives it content:encoded. */
const rss = (items: Item[]) =>
  `<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Calm Notes</title><link>https://calmnotes.example/</link>${items
    .map(
      ({ guid, link, full }, i) =>
        `<item><title>${guid}</title><guid>${guid}</guid>${link ? `<link>${link}</link>` : ''}<description>${SUBTITLE}</description>` +
        `<pubDate>${new Date(NOW - (i + 1) * 60_000).toUTCString()}</pubDate>` +
        (full ? `<content:encoded><![CDATA[<p>The Feed's own full text.</p>]]></content:encoded>` : '') +
        `</item>`,
    )
    .join('')}</channel></rss>`;

/** What each address answers: a body, or a status. Anything else is a 404. */
let pages: Record<string, string | number> = {};
const network = vi.fn(async (url: string) => {
  const page = pages[url];
  if (typeof page === 'string') return new Response(page, { headers: { 'content-type': 'text/html' } });
  return new Response('', { status: typeof page === 'number' ? page : 404 });
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  pages = {};
  network.mockClear();
  vi.stubGlobal('fetch', (url: string) => network(url));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function follow(items: Item[]) {
  const t = convexTest(schema, modules);
  const [a, b] = await t.run(async (ctx) => [
    await ctx.db.insert('users', { email: 'a@example.com' }),
    await ctx.db.insert('users', { email: 'b@example.com' }),
  ]);
  const owner = t.withIdentity({ subject: a });
  pages[FEED] = rss(items);
  expect(await owner.action(api.feeds.add, { url: FEED })).toEqual({ ok: true });
  const feedId = await t.run(async (ctx) => (await ctx.db.query('feeds').first())!._id);
  const idOf = (guid: string) =>
    t.run(async (ctx) => (await ctx.db.query('articles').withIndex('by_feed_guid', (q) => q.eq('feedId', feedId).eq('guid', guid)).first())?._id as Id<'articles'>);
  const open = async (guid: string) => owner.query(api.articles.get, { id: await idOf(guid) });
  const finish = () => t.finishAllScheduledFunctions(vi.runAllTimers);
  return { t, owner, other: t.withIdentity({ subject: b }), feedId, idOf, open, finish };
}

const textOf = (view: unknown) => JSON.stringify(view);
/** The Article pages fetched: not the Feed, nor the site's home page that adding a Feed reads for its name (T21). */
const pageFetches = () => network.mock.calls.map(([url]) => url).filter((url) => url !== FEED && url !== 'https://calmnotes.example/');

describe('a summary-only Feed reads in full, from its pages (FEE-25, T8)', () => {
  test('until its page is read, the Article says it is on its way, over its Subtitle', async () => {
    const s = await follow([{ guid: 'slow', link: 'https://calmnotes.example/slow' }]);
    pages['https://calmnotes.example/slow'] = article;
    expect(await s.open('slow')).toMatchObject({
      page: 'extracting',
      subtitle: SUBTITLE,
      blocks: [{ type: 'paragraph', spans: [{ text: SUBTITLE }] }],
    });
  });

  test('then the Reading view has the Article text from its page, with its image', async () => {
    const s = await follow([{ guid: 'slow', link: 'https://calmnotes.example/slow' }]);
    pages['https://calmnotes.example/slow'] = article;
    await s.finish();
    const view = await s.open('slow');
    expect(view).not.toHaveProperty('page');
    expect(textOf(view)).toContain('Slow reading is a practice, not a speed.');
    expect(view).toMatchObject({ imageUrl: 'https://calmnotes.example/img/slow-reading.jpg' });
  });

  test("a Feed's own full text is always used: its pages are never fetched (T8)", async () => {
    const s = await follow([{ guid: 'full', link: 'https://calmnotes.example/full', full: true }]);
    await s.finish();
    expect(pageFetches()).toEqual([]);
    expect(await s.open('full')).not.toHaveProperty('page');
  });

  test('an Article with no link to read is left as its Subtitle, with nothing to fetch', async () => {
    const s = await follow([{ guid: 'nolink' }]);
    await s.finish();
    expect(pageFetches()).toEqual([]);
    expect(await s.open('nolink')).not.toHaveProperty('page');
  });

  test.each([
    ['a page with no Article on it', index, undefined],
    ['a page behind a paywall', paywall, 'https://daily.example/img/long-game.jpg'],
    ["a page that won't load", 500, undefined],
  ])('%s: the Article is marked, and keeps its Subtitle and image for the fallback (Q6)', async (_case, page, image) => {
    const s = await follow([{ guid: 'x', link: 'https://calmnotes.example/x' }]);
    pages['https://calmnotes.example/x'] = page;
    await s.finish();
    const view = await s.open('x');
    expect(view).toMatchObject({ page: 'unavailable', subtitle: SUBTITLE, blocks: [{ type: 'paragraph', spans: [{ text: SUBTITLE }] }] });
    if (image) expect(view).toMatchObject({ imageUrl: image });
    else expect(view).not.toHaveProperty('imageUrl');
  });

  test("pages are read under the fetch policy: a link to a private host isn't fetched at all (T18)", async () => {
    const s = await follow([{ guid: 'local', link: 'https://localhost/admin' }]);
    await s.finish();
    expect(pageFetches()).toEqual([]);
    expect(await s.open('local')).toMatchObject({ page: 'unavailable' });
  });

  test("a page's scripts, frames and handlers never reach the stored Article (Q8)", async () => {
    const s = await follow([{ guid: 'slow', link: 'https://calmnotes.example/slow' }]);
    pages['https://calmnotes.example/slow'] = article;
    await s.finish();
    expect(textOf(await s.open('slow'))).not.toMatch(/track\(|tracker\.example|javascript:|alert|evil\.example/);
  });

  test('a big first fetch reads every page, one after another', async () => {
    const items = Array.from({ length: 12 }, (_, i) => ({ guid: `g${i}`, link: `https://calmnotes.example/${i}` }));
    for (const { link } of items) pages[link] = article;
    const s = await follow(items);
    await s.finish();
    const views = await Promise.all(items.map(({ guid }) => s.open(guid)));
    expect(views.filter((view) => view && 'page' in view)).toEqual([]);
    expect(pageFetches()).toHaveLength(items.length);
  });

  test('a Feed removed before its pages are read never has them fetched', async () => {
    const s = await follow([{ guid: 'slow', link: 'https://calmnotes.example/slow' }]);
    pages['https://calmnotes.example/slow'] = article;
    await s.owner.mutation(api.feeds.remove, { id: s.feedId });
    await expect(s.finish()).resolves.not.toThrow();
    expect(pageFetches()).toEqual([]);
    expect(await s.t.run((ctx) => ctx.db.query('articles').take(5))).toEqual([]);
  });

  test("new Articles stored while a Feed's pages are being read join that run: every page is fetched once", async () => {
    const first = { guid: 'one', link: 'https://calmnotes.example/one' };
    const second = { guid: 'two', link: 'https://calmnotes.example/two' };
    pages[first.link] = article;
    pages[second.link] = article;
    const s = await follow([first]);
    // The Feed is checked again before its first page is read, and has a new Article.
    pages[FEED] = rss([second, first]);
    await s.t.action(internal.refresh.refreshFeed, { feedId: s.feedId });
    await s.finish();
    expect(pageFetches().sort()).toEqual([first.link, second.link]);
    expect(await s.open('two')).not.toHaveProperty('page');
  });

  test('an Article whose reading never finishes (the server stopped mid-page) falls back, never spins forever', async () => {
    const s = await follow([{ guid: 'stuck', link: 'https://calmnotes.example/stuck' }]);
    // Claimed for reading, then nothing: as if the action died before storing what it read.
    expect(await s.t.mutation(internal.extract.claim, { articleId: await s.idOf('stuck') })).toBe(true);
    expect(await s.open('stuck')).toMatchObject({ page: 'extracting' });
    vi.advanceTimersByTime(16 * 60_000);
    await s.t.finishInProgressScheduledFunctions();
    expect(await s.open('stuck')).toMatchObject({ page: 'unavailable' });
  });

  test('a page is claimed once: a second run never reads it again', async () => {
    const s = await follow([{ guid: 'once', link: 'https://calmnotes.example/once' }]);
    const articleId = await s.idOf('once');
    expect(await s.t.mutation(internal.extract.claim, { articleId })).toBe(true);
    expect(await s.t.mutation(internal.extract.claim, { articleId })).toBe(false);
  });

  test("another User still can't open the Article (Q10)", async () => {
    const s = await follow([{ guid: 'slow', link: 'https://calmnotes.example/slow' }]);
    pages['https://calmnotes.example/slow'] = article;
    await s.finish();
    expect(await s.other.query(api.articles.get, { id: await s.idOf('slow') })).toBeNull();
  });
});
