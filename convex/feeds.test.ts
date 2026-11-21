/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import verge from './lib/feed/fixtures/verge.xml?raw';
import schema from './schema';

// As in auth.test.ts: the test identity's subject is the user id.
vi.mock('@convex-dev/auth/server', async (original) => ({
  ...(await original<typeof import('@convex-dev/auth/server')>()),
  getAuthUserId: async (ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) =>
    (await ctx.auth.getUserIdentity())?.subject ?? null,
}));

const modules = import.meta.glob('./**/*.ts');

/** A subscriber feed URL with a personal key in it, as some feeds have (T9). */
const FEED_URL = 'https://www.theverge.com/rss/partner/subscriber-only-full-feed/rss.xml?key=SECRET-KEY-123';

/** The fake network: every test answers fetches itself; nothing reaches the real one. */
const network = vi.fn<(url: string) => Promise<Response>>();
beforeEach(() => {
  network.mockReset();
  network.mockImplementation(async () => new Response(verge, { status: 200 }));
  vi.stubGlobal('fetch', (url: string) => network(url));
});
afterEach(() => vi.unstubAllGlobals());

async function setup() {
  const t = convexTest(schema, modules);
  const [a, b] = await t.run(async (ctx) => [
    await ctx.db.insert('users', { email: 'a@example.com' }),
    await ctx.db.insert('users', { email: 'b@example.com' }),
  ]);
  return { t, a: t.withIdentity({ subject: a }), b: t.withIdentity({ subject: b }) };
}

describe('signed out (Q10)', () => {
  test('adding a Feed, reading All and opening an Article are refused', async () => {
    const { t } = await setup();
    await expect(t.action(api.feeds.add, { url: FEED_URL })).rejects.toThrow(/SIGNED_OUT/);
    await expect(t.query(api.articles.all, {})).rejects.toThrow(/SIGNED_OUT/);
    await expect(t.query(api.articles.get, { id: 'x' })).rejects.toThrow(/SIGNED_OUT/);
    expect(network).not.toHaveBeenCalled();
  });
});

describe('adding a Feed', () => {
  test("fetches it at once, and its Articles appear in All, newest first, with the Feed's name", async () => {
    const { a } = await setup();
    expect(await a.action(api.feeds.add, { url: FEED_URL })).toEqual({ ok: true });
    expect(network).toHaveBeenCalledTimes(1);

    const all = await a.query(api.articles.all, {});
    expect(all.map((row) => row.title)).toEqual([
      'The UN fails to agree on rules regulating ‘killer robots’',
      'The FBI and USDA were reportedly hacked',
      expect.stringMatching(/^Amazon’s first digital photo frame/),
    ]);
    expect(all.every((row) => row.feedTitle === 'The Verge - Full RSS for subscribers | The Verge')).toBe(true);
    const dates = all.map((row) => row.publishedAt);
    expect(dates).toEqual([...dates].sort((x, y) => y - x));
  });

  test('the same Feed twice is refused, without a second fetch or duplicate Articles', async () => {
    const { a } = await setup();
    await a.action(api.feeds.add, { url: FEED_URL });
    expect(await a.action(api.feeds.add, { url: FEED_URL })).toEqual({ ok: false, reason: 'already-added' });
    expect(await a.query(api.articles.all, {})).toHaveLength(3);
  });

  test.each([
    ['not https', 'http://example.com/feed', 'invalid-url', false],
    ['too long', `https://example.com/${'a'.repeat(3000)}`, 'invalid-url', false],
  ])('a URL that is %s is refused without fetching', async (_case, url, reason, fetched) => {
    const { a } = await setup();
    expect(await a.action(api.feeds.add, { url })).toEqual({ ok: false, reason });
    expect(network.mock.calls.length > 0).toBe(fetched);
  });

  test.each([
    ['unreachable', async () => Promise.reject(new TypeError('down')), 'unreachable'],
    ['an error status', async () => new Response('nope', { status: 500 }), 'unreachable'],
    ['not a feed', async () => new Response('<!doctype html><html><body>Hi</body></html>'), 'not-a-feed'],
    ['too large', async () => new Response('x', { headers: { 'content-length': String(10 * 1024 * 1024) } }), 'too-large'],
  ])('a Feed that is %s is reported, and no Feed is created', async (_case, answer, reason) => {
    const { t, a } = await setup();
    network.mockImplementation(answer);
    expect(await a.action(api.feeds.add, { url: FEED_URL })).toEqual({ ok: false, reason });
    expect(await t.run((ctx) => ctx.db.query('feeds').take(1))).toEqual([]);
  });
});

describe('what a fetch stores', () => {
  test('repeated guids in one fetch are stored once', async () => {
    const { a } = await setup();
    const item = '<item><title>Same</title><guid>g1</guid><pubDate>Sat, 21 Nov 2026 12:00:00 GMT</pubDate></item>';
    network.mockImplementation(async () => new Response(`<rss version="2.0"><channel><title>T</title>${item}${item}</channel></rss>`));
    await a.action(api.feeds.add, { url: FEED_URL });
    expect(await a.query(api.articles.all, {})).toHaveLength(1);
  });

  test('the same Feed written differently is still the same Feed', async () => {
    const { a } = await setup();
    await a.action(api.feeds.add, { url: FEED_URL });
    const shouted = FEED_URL.replace('www.theverge.com', 'WWW.TheVerge.com');
    expect(await a.action(api.feeds.add, { url: `  ${shouted} ` })).toEqual({ ok: false, reason: 'already-added' });
  });
});

describe('the feed URL is a secret (Q9)', () => {
  test('no query returns it', async () => {
    const { a } = await setup();
    await a.action(api.feeds.add, { url: FEED_URL });
    const all = await a.query(api.articles.all, {});
    const article = await a.query(api.articles.get, { id: all[0].id });
    for (const result of [all, article]) {
      expect(JSON.stringify(result)).not.toContain('SECRET-KEY-123');
      expect(JSON.stringify(result)).not.toContain('subscriber-only-full-feed');
    }
  });
});

describe('each User reads only their own Articles (Q10)', () => {
  test("User B's All is empty, and B can't open A's Article", async () => {
    const { a, b } = await setup();
    await a.action(api.feeds.add, { url: FEED_URL });
    const [first] = await a.query(api.articles.all, {});
    expect(await b.query(api.articles.all, {})).toEqual([]);
    expect(await b.query(api.articles.get, { id: first.id })).toBeNull();
  });

  test('two Users can follow the same Feed, each with their own copy', async () => {
    const { a, b } = await setup();
    await a.action(api.feeds.add, { url: FEED_URL });
    expect(await b.action(api.feeds.add, { url: FEED_URL })).toEqual({ ok: true });
    expect(await b.query(api.articles.all, {})).toHaveLength(3);
  });
});

describe('opening an Article', () => {
  test('returns its title, Feed, date, link and cleaned blocks (T17)', async () => {
    const { a } = await setup();
    await a.action(api.feeds.add, { url: FEED_URL });
    const [first] = await a.query(api.articles.all, {});
    const article = await a.query(api.articles.get, { id: first.id });
    expect(article).toMatchObject({
      title: first.title,
      feedTitle: first.feedTitle,
      publishedAt: first.publishedAt,
      link: 'https://www.theverge.com/tech/1039554/un-regulations-killer-robots',
    });
    expect(article!.blocks.some((block) => block.type === 'paragraph')).toBe(true);
    expect(article!.blocks.some((block) => block.type === 'image')).toBe(true);
  });

  test.each([
    ['a malformed id', 'not-an-id'],
    ['an empty id', ''],
    ['a huge id', 'x'.repeat(10_000)],
  ])('%s opens nothing', async (_case, id) => {
    const { a } = await setup();
    expect(await a.query(api.articles.get, { id })).toBeNull();
  });

  test("another table's id opens nothing", async () => {
    const { t, a } = await setup();
    await a.action(api.feeds.add, { url: FEED_URL });
    const feedId = await t.run(async (ctx) => (await ctx.db.query('feeds').first())!._id);
    expect(await a.query(api.articles.get, { id: feedId as unknown as Id<'articles'> })).toBeNull();
  });
});

describe('Article rows (FEE-27)', () => {
  test('All carries each row: Subtitle, lead image, the Feed favicon from its site, and Read', async () => {
    const { a } = await setup();
    await a.action(api.feeds.add, { url: FEED_URL });
    const [first] = await a.query(api.articles.all, {});
    expect(first).toMatchObject({
      subtitle: 'Countries agree to ‘start discussing options’ for rules around autonomous weapons.',
      imageUrl: expect.stringMatching(/^https:\/\/platform\.theverge\.com\//),
      faviconUrl: 'https://www.theverge.com/favicon.ico',
      read: false,
    });
  });

  test("the favicon comes from the Feed's site, never its secret URL (Q9)", async () => {
    const { a } = await setup();
    network.mockImplementation(
      async () =>
        new Response(
          '<rss version="2.0"><channel><title>T</title><link>https://site.example.com/blog</link><item><title>A</title><guid>1</guid></item></channel></rss>',
        ),
    );
    await a.action(api.feeds.add, { url: 'https://feeds.private.example.net/x.xml?key=SECRET-KEY-123' });
    const [row] = await a.query(api.articles.all, {});
    expect(row.faviconUrl).toBe('https://site.example.com/favicon.ico');
    expect(JSON.stringify(row)).not.toMatch(/SECRET|feeds\.private/);
  });
});

describe('Read (P7)', () => {
  test('opening an Article marks it Read; Read Articles stay in All', async () => {
    const { a } = await setup();
    await a.action(api.feeds.add, { url: FEED_URL });
    const [first, second] = await a.query(api.articles.all, {});
    await a.mutation(api.articles.markRead, { id: first.id });
    await a.mutation(api.articles.markRead, { id: first.id });
    const all = await a.query(api.articles.all, {});
    expect(all).toHaveLength(3);
    expect(all.find((r) => r.id === first.id)!.read).toBe(true);
    expect(all.find((r) => r.id === second.id)!.read).toBe(false);
  });

  test("another User can't mark an Article Read, and a malformed id marks nothing", async () => {
    const { a, b } = await setup();
    await a.action(api.feeds.add, { url: FEED_URL });
    const [first] = await a.query(api.articles.all, {});
    await b.mutation(api.articles.markRead, { id: first.id });
    await a.mutation(api.articles.markRead, { id: 'not-an-id' });
    await a.mutation(api.articles.markRead, { id: 'x'.repeat(10_000) });
    expect((await a.query(api.articles.all, {})).every((r) => !r.read)).toBe(true);
  });

  test('signed out, it is refused', async () => {
    const { t } = await setup();
    await expect(t.mutation(api.articles.markRead, { id: 'x' })).rejects.toThrow(/SIGNED_OUT/);
  });
});
