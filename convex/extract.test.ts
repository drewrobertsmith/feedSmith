/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { runScheduledNow } from '../test/convex-scheduled';
import { captureLogs } from '../test/log-lines';

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

/** Reading the page at `/broken` can be made to die, or to give what can't be stored (FEE-110). */
const reading = vi.hoisted(() => ({ broken: undefined as undefined | 'reading' | 'storing' }));
vi.mock('./lib/feed/extract', async (original) => {
  const real = await original<typeof import('./lib/feed/extract')>();
  const { Effect } = await import('effect');
  return {
    ...real,
    fetchAndExtractEffect: (link: string) => {
      if (!link.endsWith('/broken') || !reading.broken) return real.fetchAndExtractEffect(link);
      if (reading.broken === 'reading') return Effect.die(new Error(`reading ${link} blew up`));
      return Effect.succeed({ _tag: 'Extracted', blocks: [{ type: 'nonsense' }], omitted: [] });
    },
  };
});

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
  reading.broken = undefined;
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
  expect(await owner.action(api.feeds.add, { url: FEED })).toMatchObject({ ok: true });
  const feedId = await t.run(async (ctx) => (await ctx.db.query('feeds').first())!._id);
  const idOf = (guid: string) =>
    t.run(async (ctx) => (await ctx.db.query('articles').withIndex('by_feed_guid', (q) => q.eq('feedId', feedId).eq('guid', guid)).first())?._id as Id<'articles'>);
  const open = async (guid: string) => owner.query(api.articles.get, { id: await idOf(guid) });
  const finish = () => runScheduledNow(t);
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

describe('a bug while reading a page costs only that Article (FEE-110)', () => {
  test.each([
    ['reading it dies', 'reading'],
    ["what it gives can't be stored", 'storing'],
  ] as const)('%s: that Article falls back (Q6), the next is still read, and the log names only its id', async (_case, broken) => {
    const logs = captureLogs();
    reading.broken = broken;
    pages['https://calmnotes.example/broken'] = article;
    pages['https://calmnotes.example/fine'] = article;
    const s = await follow([
      { guid: 'broken', link: 'https://calmnotes.example/broken' },
      { guid: 'fine', link: 'https://calmnotes.example/fine' },
    ]);
    await s.finish();
    expect(await s.open('broken')).toMatchObject({ page: 'unavailable', subtitle: SUBTITLE });
    expect(textOf(await s.open('fine'))).toContain('Slow reading is a practice, not a speed.');
    expect(logs.all()).not.toContain('calmnotes.example');
    // The bug is logged as an error, by the Article's id (FEE-113).
    expect(logs.lines('defect while reading a page')).toEqual([
      expect.objectContaining({ level: 'ERROR', annotations: expect.objectContaining({ articleId: await s.idOf('broken') }) }),
    ]);
    logs.restore();
  });
});

describe('what the server logs about reading pages (FEE-113, Q9)', () => {
  test("each page read logs the Article's id and its outcome, and never its link", async () => {
    const logs = captureLogs();
    pages['https://calmnotes.example/read'] = article;
    pages['https://calmnotes.example/gone'] = 500;
    const s = await follow([
      { guid: 'read', link: 'https://calmnotes.example/read' },
      { guid: 'gone', link: 'https://calmnotes.example/gone' },
    ]);
    await s.finish();
    const outcomes = Object.fromEntries(logs.lines('page read').map((line) => [line.annotations.articleId, line.annotations.outcome]));
    expect(outcomes).toEqual({ [await s.idOf('read')]: 'extracted', [await s.idOf('gone')]: 'unreachable' });
    expect(logs.all()).not.toContain('calmnotes.example');
    logs.restore();
  });
});

describe("reading pages never touches what All reads, unless it brings an image (FEE-62)", () => {
  /** The article page without its preview image: reading it adds text, and nothing All shows. */
  const imageless = article.replace(/<meta[^>]+(og:image|twitter:image)[^>]*>/g, '');
  const rows = (t: ReturnType<typeof convexTest>) => t.run((ctx) => ctx.db.query('articles').collect());

  test('the Article rows are exactly as they were after their pages are read', async () => {
    pages['https://calmnotes.example/one'] = imageless;
    pages['https://calmnotes.example/two'] = imageless;
    const s = await follow([
      { guid: 'one', link: 'https://calmnotes.example/one' },
      { guid: 'two', link: 'https://calmnotes.example/two' },
    ]);
    const before = await rows(s.t);

    await s.finish();

    expect(pageFetches()).toHaveLength(2);
    expect(await rows(s.t)).toEqual(before);
    // The text did arrive: the Reading view has it.
    expect(textOf(await s.open('one'))).not.toContain('"page"');
  });

  test("a page that couldn't be read leaves the rows alone too, and the Reading view still knows", async () => {
    pages['https://calmnotes.example/gone'] = 500;
    const s = await follow([{ guid: 'gone', link: 'https://calmnotes.example/gone' }]);
    const before = await rows(s.t);

    await s.finish();

    expect(await rows(s.t)).toEqual(before);
    expect(await s.open('gone')).toMatchObject({ page: 'unavailable' });
  });
});

describe('moving page-reading state off the Article (FEE-62 migration)', () => {
  test('each state moves exactly; extracted needs no row; the Articles lose the old field; a second run changes nothing', async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const userId = await ctx.db.insert('users', { email: 'a@example.com' });
      const feedId = await ctx.db.insert('feeds', { userId, url: FEED, title: 'Calm Notes' });
      const article = (guid: string, extraction?: 'pending' | 'reading' | 'extracted' | 'failed') =>
        ctx.db.insert('articles', { userId, feedId, guid, title: guid, publishedAt: NOW, ...(extraction ? { extraction } : {}) });
      return {
        pending: await article('p', 'pending'),
        reading: await article('r', 'reading'),
        extracted: await article('e', 'extracted'),
        failed: await article('f', 'failed'),
        full: await article('full'),
      };
    });

    await t.mutation(internal.migrations.movePageReads, {});
    const afterFirst = await t.run(async (ctx) => [await ctx.db.query('articles').collect(), await ctx.db.query('pageReads').collect()]);
    await t.mutation(internal.migrations.movePageReads, {});

    const [articles, reads] = await t.run(async (ctx) => [await ctx.db.query('articles').collect(), await ctx.db.query('pageReads').collect()]);
    // A claim made by the code before this move belongs to a run that's gone: its page is read again.
    expect(Object.fromEntries(reads.map((read) => [read.articleId, read.state]))).toEqual({
      [ids.pending]: 'pending',
      [ids.reading]: 'pending',
      [ids.failed]: 'failed',
    });
    for (const article of articles) expect(article).not.toHaveProperty('extraction');
    expect([articles, reads]).toEqual(afterFirst);
  });
});

test("a Feed whose pages were waiting when the code changed has them read, not stranded (FEE-62 migration)", async () => {
  const t = convexTest(schema, modules);
  pages['https://calmnotes.example/waiting'] = article;
  const articleId = await t.run(async (ctx) => {
    const userId = await ctx.db.insert('users', { email: 'a@example.com' });
    const feedId = await ctx.db.insert('feeds', { userId, url: FEED, title: 'Calm Notes' });
    const id = await ctx.db.insert('articles', {
      userId,
      feedId,
      guid: 'waiting',
      title: 'waiting',
      link: 'https://calmnotes.example/waiting',
      publishedAt: NOW,
      extraction: 'reading',
    });
    await ctx.db.insert('articleBodies', { userId, articleId: id, blocks: [], omitted: [] });
    return id;
  });

  await t.mutation(internal.migrations.movePageReads, {});
  await runScheduledNow(t);

  expect(network.mock.calls.map(([url]) => url)).toContain('https://calmnotes.example/waiting');
  expect(await t.run((ctx) => ctx.db.query('pageReads').collect())).toEqual([]);
  const body = await t.run((ctx) => ctx.db.query('articleBodies').withIndex('by_article', (q) => q.eq('articleId', articleId)).unique());
  expect(body!.blocks.length).toBeGreaterThan(0);
});
