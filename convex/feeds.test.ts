/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import verge from './lib/feed/fixtures/verge.xml?raw';
import rateLimiterTest from '@convex-dev/rate-limiter/test';
import twins from './lib/feed/fixtures/page-format-twins.html?raw';
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
    expect(await a.action(api.feeds.add, { url: FEED_URL })).toMatchObject({ ok: true });
    expect(network.mock.calls[0][0]).toBe(FEED_URL.replace('www.theverge.com', 'www.theverge.com'));

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
    network.mockClear();
    expect(await a.action(api.feeds.add, { url: FEED_URL })).toEqual({
      ok: false,
      reason: 'already-added',
      title: 'The Verge - Full RSS for subscribers | The Verge',
      feedId: expect.any(String),
    });
    // Known before fetching: re-adding costs nothing.
    expect(network).not.toHaveBeenCalled();
    expect(await a.query(api.articles.all, {})).toHaveLength(3);
  });

  test.each([
    ['not https', 'http://example.com/feed', 'invalid-url', false],
    ['too long', `https://example.com/${'a'.repeat(3000)}`, 'invalid-url', false],
    // Not an address at all (FEE-96): never fetched as https://theverge.
    ['a name, one word', 'theverge', 'invalid-url', false],
    ['a name, two words', 'the verge', 'invalid-url', false],
  ])('a URL that is %s is refused without fetching', async (_case, url, reason, fetched) => {
    const { a } = await setup();
    expect(await a.action(api.feeds.add, { url })).toEqual({ ok: false, reason });
    expect(network.mock.calls.length > 0).toBe(fetched);
  });

  test.each([
    ['unreachable', async () => Promise.reject(new TypeError('down')), 'unreachable'],
    ['an error status', async () => new Response('nope', { status: 500 }), 'unreachable'],
    // A web page with no feed links (T21): the plainer answer.
    ['a page with no feed', async () => new Response('<!doctype html><html><body>Hi</body></html>'), 'no-feed-found'],
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
    expect(await a.action(api.feeds.add, { url: `  ${shouted} ` })).toMatchObject({ ok: false, reason: 'already-added' });
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
    expect(await b.action(api.feeds.add, { url: FEED_URL })).toMatchObject({ ok: true });
    expect(await b.query(api.articles.all, {})).toHaveLength(3);
  });

  test("a new Feed is answered with its id, always the caller's own, so the app can open its chip (FEE-45)", async () => {
    const { t, a, b } = await setup();
    const owner = (feedId: Id<'feeds'>) => t.run(async (ctx) => (await ctx.db.get(feedId))?.userId);
    const users = await t.run((ctx) => ctx.db.query('users').take(2));
    const [userA, userB] = users.map((user) => user._id);

    const added = await a.action(api.feeds.add, { url: FEED_URL });
    // Exactly the id: never the Feed's URL (Q9).
    expect(added).toEqual({ ok: true, feedId: expect.any(String) });
    if (!added.ok) throw new Error('not added');
    expect(await owner(added.feedId)).toBe(userA);

    // The other User adding the same URL gets their own Feed's id, never the first User's.
    const theirs = await b.action(api.feeds.add, { url: FEED_URL });
    if (!theirs.ok) throw new Error('not added');
    expect(theirs.feedId).not.toBe(added.feedId);
    expect(await owner(theirs.feedId)).toBe(userB);

    // Adding it again answers with the same Feed, already followed.
    expect(await a.action(api.feeds.add, { url: FEED_URL })).toMatchObject({ reason: 'already-added', feedId: added.feedId });
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

describe('finding a Feed from a website (T21)', () => {
  const html = (head: string) => new Response(`<!doctype html><html><head>${head}</head><body><p>Home</p></body></html>`);
  const rssOf = (title: string) =>
    new Response(`<rss version="2.0"><channel><title>${title}</title><link>https://www.site.example.com/</link><item><title>Post</title><guid>p1</guid></item></channel></rss>`);
  const SITE_HEAD =
    '<meta property="og:site_name" content="Site Example"><link rel="apple-touch-icon" href="/touch.png"><link rel="alternate" type="application/rss+xml" title="All posts" href="/rss.xml">';

  /** The fake network as a map of addresses; anything else is a 404. */
  const route = (pages: Record<string, () => Response>) =>
    network.mockImplementation(async (url) => (pages[url] ?? (() => new Response('nope', { status: 404 })))());

  test("typing a site's address finds its one feed and adds it, named and iconed by the site", async () => {
    const { a } = await setup();
    route({
      'https://site.example.com/': () => new Response(null, { status: 301, headers: { location: 'https://www.site.example.com/' } }),
      'https://www.site.example.com/': () => html(SITE_HEAD),
      'https://www.site.example.com/rss.xml': () => rssOf('Site Example – Everything, all the time'),
    });
    expect(await a.action(api.feeds.add, { url: 'site.example.com' })).toMatchObject({ ok: true });
    const [row] = await a.query(api.articles.all, {});
    expect(row).toMatchObject({ title: 'Post', feedTitle: 'Site Example', faviconUrl: 'https://www.site.example.com/touch.png' });
  });

  test('a site with several feeds offers them to choose from, and adds nothing yet', async () => {
    const { t, a } = await setup();
    route({
      'https://site.example.com/': () =>
        html(
          '<link rel="alternate" type="application/rss+xml" title="All posts" href="/rss.xml"><link rel="alternate" type="application/atom+xml" title="Reviews" href="/reviews.atom">',
        ),
      'https://site.example.com/reviews.atom': () => rssOf('Reviews'),
    });
    expect(await a.action(api.feeds.add, { url: 'https://site.example.com/' })).toEqual({
      ok: false,
      reason: 'choose',
      choices: [
        { url: 'https://site.example.com/rss.xml', title: 'All posts' },
        { url: 'https://site.example.com/reviews.atom', title: 'Reviews' },
      ],
    });
    expect(await t.run((ctx) => ctx.db.query('feeds').take(1))).toEqual([]);
    expect(await a.action(api.feeds.add, { url: 'https://site.example.com/reviews.atom' })).toMatchObject({ ok: true });
  });

  test("a site whose one feed you already follow says so, by the Feed's name, without fetching the feed again", async () => {
    const { a } = await setup();
    route({
      'https://site.example.com/': () => html(SITE_HEAD),
      'https://site.example.com/rss.xml': () => rssOf('Site feed'),
    });
    await a.action(api.feeds.add, { url: 'https://site.example.com/rss.xml' });
    network.mockClear();
    expect(await a.action(api.feeds.add, { url: 'site.example.com' })).toEqual({
      ok: false,
      reason: 'already-added',
      title: 'Site feed',
      feedId: expect.any(String),
    });
    expect(network.mock.calls.map(([url]) => url)).toEqual(['https://site.example.com/']);
  });

  test('a page with no feed says so', async () => {
    const { a } = await setup();
    route({ 'https://shop.example.com/': () => html('<title>Shop</title>') });
    expect(await a.action(api.feeds.add, { url: 'shop.example.com' })).toEqual({ ok: false, reason: 'no-feed-found' });
  });

  test("an address that can't be reached says so", async () => {
    const { a } = await setup();
    network.mockImplementation(async () => Promise.reject(new TypeError('down')));
    expect(await a.action(api.feeds.add, { url: 'gone.example.com' })).toEqual({ ok: false, reason: 'unreachable' });
  });

  test('a feed link that leads to another page is followed one level only', async () => {
    const { a } = await setup();
    route({
      'https://site.example.com/': () => html('<link rel="alternate" type="application/rss+xml" href="/more">'),
      'https://site.example.com/more': () => html('<link rel="alternate" type="application/rss+xml" href="/rss.xml">'),
      'https://site.example.com/rss.xml': () => rssOf('Never reached'),
    });
    expect(await a.action(api.feeds.add, { url: 'site.example.com' })).toEqual({ ok: false, reason: 'not-a-feed' });
    expect(network.mock.calls.map(([url]) => url)).not.toContain('https://site.example.com/rss.xml');
  });

  test("typing a feed URL still works, and the Feed is named by its site's homepage", async () => {
    const { a } = await setup();
    route({
      'https://www.site.example.com/rss.xml': () => rssOf('Site Example – Everything, all the time'),
      'https://www.site.example.com/': () => html(SITE_HEAD),
    });
    expect(await a.action(api.feeds.add, { url: 'https://www.site.example.com/rss.xml' })).toMatchObject({ ok: true });
    expect((await a.query(api.articles.all, {}))[0].feedTitle).toBe('Site Example');
  });

  // FEE-89: a site named only by its page title gets the part before the tagline.
  const LONG_TITLE = 'Pluralistic: Daily links from Cory Doctorow – No trackers, no ads. Black type, white background.';

  test('a site named only by a long page title is added by the part before its tagline', async () => {
    const { a } = await setup();
    route({
      'https://www.site.example.com/': () => html(`<title>${LONG_TITLE}</title><link rel="alternate" type="application/rss+xml" href="/rss.xml">`),
      'https://www.site.example.com/rss.xml': () => rssOf('Pluralistic'),
    });
    expect(await a.action(api.feeds.add, { url: 'https://www.site.example.com/' })).toMatchObject({ ok: true });
    expect((await a.query(api.articles.all, {}))[0].feedTitle).toBe('Pluralistic');
  });

  describe('a Feed already named by a long page title is shortened once, on its next fetch (FEE-89)', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    /** A Feed stored before FEE-89, with the name its site's homepage gave then. */
    async function existing(title: string) {
      const { t, a } = await setup();
      const feedId = await t.run(async (ctx) => {
        const userId = (await ctx.db.query('users').first())!._id;
        return ctx.db.insert('feeds', { userId, url: 'https://www.site.example.com/rss.xml', title, siteUrl: 'https://www.site.example.com/' });
      });
      const fetched = () =>
        t.mutation(internal.refresh.recordFetch, { feedId, now: Date.now(), siteUrl: 'https://www.site.example.com/', articles: [] });
      const name = async () => (await t.run((ctx) => ctx.db.get(feedId)))!.title;
      /** Runs what the fetch scheduled now (the name check), not the Feed's next fetch, booked for later. */
      const settle = async () => {
        vi.advanceTimersByTime(1);
        await t.finishInProgressScheduledFunctions();
      };
      return { t, a, fetched, name, settle };
    }
    const homepageFetches = () => network.mock.calls.filter(([url]) => url === 'https://www.site.example.com/').length;

    test('its name came from the page title: it becomes the part before the tagline', async () => {
      route({ 'https://www.site.example.com/': () => html(`<title>${LONG_TITLE}</title>`) });
      const { fetched, name, settle } = await existing(LONG_TITLE);
      await fetched();
      await settle();
      expect(await name()).toBe('Pluralistic');
    });

    test('a name the site states itself stays whole, and is checked only once', async () => {
      route({
        'https://www.site.example.com/': () =>
          html('<meta property="og:site_name" content="Stratechery by Ben Thompson"><title>Stratechery by Ben Thompson – On…</title>'),
      });
      const { fetched, name, settle } = await existing('Stratechery by Ben Thompson');
      await fetched();
      await settle();
      await fetched();
      await settle();
      expect(await name()).toBe('Stratechery by Ben Thompson');
      expect(homepageFetches()).toBe(1);
    });

    test('a name with no tagline never costs a homepage fetch', async () => {
      route({ 'https://www.site.example.com/': () => html('<title>Farnam Street</title>') });
      const { fetched, name, settle } = await existing('Farnam Street');
      await fetched();
      await settle();
      expect(await name()).toBe('Farnam Street');
      expect(homepageFetches()).toBe(0);
    });

    test("a name that isn't the page's whole title (the Feed's own, or one given since) is left alone", async () => {
      route({ 'https://www.site.example.com/': () => html(`<title>${LONG_TITLE}</title>`) });
      const { fetched, name, settle } = await existing('Pluralistic: the newsletter');
      await fetched();
      await settle();
      expect(await name()).toBe('Pluralistic: the newsletter');
    });
  });

  test("when the homepage can't be read, the Feed keeps its own title", async () => {
    const { a } = await setup();
    route({ 'https://www.site.example.com/rss.xml': () => rssOf('Own Title') });
    expect(await a.action(api.feeds.add, { url: 'https://www.site.example.com/rss.xml' })).toMatchObject({ ok: true });
    expect((await a.query(api.articles.all, {}))[0].feedTitle).toBe('Own Title');
  });

  test.each([['http://site.example.com/'], ['javascript:alert(1)'], ['ftp://site.example.com/']])(
    '%s is still refused without fetching',
    async (url) => {
      const { a } = await setup();
      expect(await a.action(api.feeds.add, { url })).toEqual({ ok: false, reason: 'invalid-url' });
      expect(network).not.toHaveBeenCalled();
    },
  );
});

describe('adding a Feed leaves the catalog alone (FEE-96)', () => {
  const home = (head: string) => new Response(`<!doctype html><html><head>${head}</head><body><p>Home of the site, with news every day.</p></body></html>`);
  const DECLARES =
    '<meta property="og:site_name" content="Site Example"><link rel="icon" href="/icon.png"><link rel="alternate" type="application/rss+xml" href="/rss.xml">';
  const route = (pages: Record<string, () => Response>) =>
    network.mockImplementation(async (url) => (pages[url] ?? (() => new Response('nope', { status: 404 })))());
  const catalog = (t: Awaited<ReturnType<typeof setup>>['t']) =>
    t.run((ctx) => ctx.db.query('feedCatalog').take(10));

  test("a site's homepage declaring one feed is added, and the catalog stays empty", async () => {
    const { t, a } = await setup();
    route({ 'https://site.example.com/': () => home(DECLARES), 'https://site.example.com/rss.xml': () => new Response(verge) });
    expect(await a.action(api.feeds.add, { url: 'site.example.com' })).toMatchObject({ ok: true });
    expect(await catalog(t)).toEqual([]);
  });

  test('a homepage declaring several feeds offers the choice, and nothing joins the catalog', async () => {
    vi.useFakeTimers();
    try {
      const { t, a } = await setup();
      route({
        'https://site.example.com/': () =>
          home(`${DECLARES}<link rel="alternate" type="application/atom+xml" title="Reviews" href="/reviews.atom">`),
        'https://site.example.com/rss.xml': () => new Response(verge),
      });
      expect(await a.action(api.feeds.add, { url: 'site.example.com' })).toMatchObject({ reason: 'choose' });
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect(await catalog(t)).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  test('adding a Feed already in the catalog leaves its entry as it was', async () => {
    const { t, a } = await setup();
    await t.mutation(internal.catalog.remember, {
      url: 'https://site.example.com/rss.xml',
      name: 'Old Name',
      host: 'site.example.com',
      siteUrl: 'https://site.example.com',
      source: 'declared',
      now: 1,
    });
    route({ 'https://site.example.com/': () => home(DECLARES), 'https://site.example.com/rss.xml': () => new Response(verge) });
    expect(await a.action(api.feeds.add, { url: 'https://site.example.com/rss.xml' })).toMatchObject({ ok: true });
    expect(await catalog(t)).toEqual([expect.objectContaining({ name: 'Old Name', seenAt: 1 })]);
  });
});

describe("a site's feed in two formats is one feed, not a choice (FEE-133)", () => {
  const PAGE = 'https://reactnative.dev/blog';
  const ATOM = 'https://reactnative.dev/blog/atom.xml';
  const RSS = 'https://reactnative.dev/blog/rss.xml';
  const atom = () =>
    new Response(
      `<feed xmlns="http://www.w3.org/2005/Atom"><title>React Native Blog</title><link href="https://reactnative.dev/blog"/><entry><id>${PAGE}/2026/10/19/react-native-0.88</id><title>React Native 0.88</title><updated>2026-10-19T00:00:00Z</updated><author><name>Fabrizio Cucci</name></author><content type="html">&lt;p&gt;Today we are excited.&lt;/p&gt;</content></entry></feed>`,
      { headers: { 'content-type': 'application/xml' } },
    );
  const serve = () =>
    network.mockImplementation(async (url) => {
      if (url === PAGE) return new Response(twins, { headers: { 'content-type': 'text/html' } });
      if (url === ATOM) return atom();
      return new Response('nope', { status: 404 });
    });
  const feeds = (t: Awaited<ReturnType<typeof setup>>['t']) => t.run((ctx) => ctx.db.query('feeds').collect());

  test('adding the page adds its Atom feed at once, with no choice, bylines and all', async () => {
    const { t, a } = await setup();
    serve();
    const added = await a.action(api.feeds.add, { url: 'reactnative.dev/blog' });
    expect(added).toMatchObject({ ok: true });
    expect((await feeds(t)).map((feed) => feed.url)).toEqual([ATOM]);
    expect(network.mock.calls.map(([url]) => url)).not.toContain(RSS);
    const [row] = await a.query(api.articles.all, { feedId: (added as { feedId: string }).feedId } as never);
    expect(row).toMatchObject({ title: 'React Native 0.88', authors: ['Fabrizio Cucci'] });
  });

  test('already following its RSS twin, adding the page opens that Feed and adds nothing (T22)', async () => {
    const { t, a } = await setup();
    const user = await t.run(async (ctx) => (await ctx.db.query('users').first())!._id);
    const followed = await t.run((ctx) => ctx.db.insert('feeds', { userId: user, url: RSS, title: 'React Native Blog' }));
    serve();
    expect(await a.action(api.feeds.add, { url: 'reactnative.dev/blog' })).toEqual({
      ok: false,
      reason: 'already-added',
      title: 'React Native Blog',
      feedId: followed,
    });
    expect(await feeds(t)).toHaveLength(1);
    expect(network.mock.calls.map(([url]) => url)).not.toContain(ATOM);
  });

  test('New address on the page moves the Feed straight to its Atom feed (FEE-129)', async () => {
    const { t, a } = await setup();
    rateLimiterTest.register(t);
    const user = await t.run(async (ctx) => (await ctx.db.query('users').first())!._id);
    const feedId = await t.run((ctx) => ctx.db.insert('feeds', { userId: user, url: 'https://old.example.com/feed', title: 'React Native' }));
    serve();
    expect(await a.action(api.feeds.newAddress, { id: feedId, url: 'reactnative.dev/blog' })).toEqual({ ok: true, feedId });
    expect((await feeds(t))[0].url).toBe(ATOM);
  });
});
