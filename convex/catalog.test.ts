/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { api, internal } from './_generated/api';
import verge from './lib/feed/fixtures/verge.xml?raw';
import rateLimiterTest from '@convex-dev/rate-limiter/test';
import schema from './schema';
import { GUESSES_PER_HOUR, rateLimiter } from './rateLimits';

vi.mock('@convex-dev/auth/server', async (original) => ({
  ...(await original<typeof import('@convex-dev/auth/server')>()),
  getAuthUserId: async (ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) =>
    (await ctx.auth.getUserIdentity())?.subject ?? null,
}));

const modules = import.meta.glob('./**/*.ts');

/** The fake network: nothing answers unless a test says so; nothing reaches the real one. */
const network = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
beforeEach(() => {
  network.mockReset();
  network.mockImplementation(async () => new Response('', { status: 404 }));
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => network(url, init));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const fetched = () => network.mock.calls.map(([url]) => url);

async function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  const [a, b] = await t.run(async (ctx) => [
    await ctx.db.insert('users', { email: 'a@example.com' }),
    await ctx.db.insert('users', { email: 'b@example.com' }),
  ]);
  return { t, a: t.withIdentity({ subject: a }), b: t.withIdentity({ subject: b }), aId: a, bId: b };
}

describe('abuse cases', () => {
  test('signed out, searching and finding are refused (Q10)', async () => {
    const { t } = await setup();
    await expect(t.query(api.catalog.search, { name: 'the verge' })).rejects.toThrow();
    await expect(t.action(api.catalog.find, { name: 'the verge' })).rejects.toThrow();
    expect(fetched()).toEqual([]);
  });

  test.each([
    ['blank', '   '],
    ['only "the"', 'the'],
    ['too long', 'a'.repeat(10_000)],
    ['punctuation only', '../../..'],
    ['emoji only', '🦊🦊'],
  ])('a hostile name (%s) fetches nothing and finds nothing', async (_case, name) => {
    const { a } = await setup();
    expect(await a.action(api.catalog.find, { name })).toEqual({ found: [] });
    expect(fetched()).toEqual([]);
  });

  test('a name never makes the server fetch anything but https on guessed sites, each one capped', async () => {
    const { a } = await setup();
    await a.action(api.catalog.find, { name: 'daring fireball' });
    const urls = fetched();
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.length).toBeLessThanOrEqual(40);
    for (const url of urls) expect(url).toMatch(/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+\//);
  });

  test('a site that redirects forever is given up on, and the search goes on to the next', async () => {
    const { a } = await setup();
    web({
      'https://theverge.com/': () => Response.redirect('https://theverge.com/', 301),
      'https://theverge.net/': () => page('The Verge', [FEED]),
      [FEED]: () => feed(),
    });
    expect((await a.action(api.catalog.find, { name: 'the verge' })).found).toEqual([FEED]);
    // Three redirects, then nothing more from that site (T18).
    expect(fetched().filter((url) => url === 'https://theverge.com/')).toHaveLength(4);
  });

  test('a huge page is given up on, and the search goes on to the next', async () => {
    const { a } = await setup();
    web({
      'https://theverge.com/': () => new Response('x'.repeat(3 * 1024 * 1024)),
      'https://theverge.net/': () => page('The Verge', [FEED]),
      [FEED]: () => feed(),
    });
    expect((await a.action(api.catalog.find, { name: 'the verge' })).found).toEqual([FEED]);
  });

  test('a page of thousands of unclosed tags is checked in linear time', async () => {
    const { a } = await setup();
    web({ 'https://theverge.com/': () => new Response(`<title>x</title>${'<script <'.repeat(200_000)}`) });
    const started = Date.now();
    await a.action(api.catalog.find, { name: 'the verge' });
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

/** The Verge's public feed, as its homepage declares it. */
const FEED = 'https://www.theverge.com/rss/index.xml';

/** A homepage naming itself `name`, declaring `feeds`, with enough words to be a real page. */
function page(name: string, feeds: string[] = [], extra = '') {
  const links = feeds.map((url) => `<link rel="alternate" type="application/rss+xml" href="${url}">`).join('');
  return new Response(
    `<html><head><title>${name}</title><meta property="og:site_name" content="${name}">${links}</head>` +
      `<body><h1>${name}</h1><p>Stories, reviews and news from ${name}, every day of the week.</p>${extra}</body></html>`,
  );
}
const feed = () => new Response(verge);

/** The fake web: these addresses answer; every other one is a 404. */
function web(sites: Record<string, () => Response>) {
  network.mockImplementation(async (url) => (sites[url] ?? (() => new Response('', { status: 404 })))());
}

describe('finding a Feed by its site’s name', () => {
  test('"the verge" finds The Verge, with its name, site and icon, and it joins the catalog', async () => {
    const { a } = await setup();
    web({ 'https://theverge.com/': () => page('The Verge', [FEED], ''), [FEED]: feed });
    expect((await a.action(api.catalog.find, { name: 'the verge' })).found).toEqual([FEED]);
    expect(await a.query(api.catalog.search, { name: 'the verge' })).toEqual([
      { kind: 'new', url: FEED, title: 'The Verge', host: 'theverge.com' },
    ]);
  });

  test('"daring fireball" finds Daring Fireball at .net, at a common address when the page declares none', async () => {
    const { a } = await setup();
    web({
      'https://daringfireball.net/': () => page('Daring Fireball'),
      'https://daringfireball.net/feed': () => feed(),
    });
    expect((await a.action(api.catalog.find, { name: 'daring fireball' })).found).toEqual(['https://daringfireball.net/feed']);
    const [found] = await a.query(api.catalog.search, { name: 'daring fireball' });
    expect(found).toMatchObject({ kind: 'new', title: 'Daring Fireball', host: 'daringfireball.net' });
  });

  test('the site of that very name stops the search: no more sites are guessed', async () => {
    const { a } = await setup();
    web({ 'https://theverge.com/': () => page('The Verge', [FEED]), [FEED]: feed });
    // Every other guess takes a moment to fail, as a real address that doesn't exist does.
    const answer = network.getMockImplementation()!;
    network.mockImplementation(async (url) =>
      url.startsWith('https://theverge.com/') || url === FEED ? answer(url) : new Promise((resolve) => setTimeout(() => resolve(answer(url)), 50)),
    );
    await a.action(api.catalog.find, { name: 'the verge' });
    // The first lanes were already under way; nothing past them starts.
    expect(fetched().length).toBeLessThanOrEqual(5);
  });

  test.each([
    ['for sale', () => page('theverge.com', [], '<p>This domain is for sale. Buy this domain today.</p>')],
    ['a parking service', () => Response.redirect('https://www.sedoparking.com/theverge.com', 302)],
    ['near-empty', () => new Response('<html><head><title>The Verge</title></head><body></body></html>')],
  ])('a parked domain (%s) never appears', async (_case, answer) => {
    const { a } = await setup();
    web({
      'https://theverge.com/': answer,
      'https://www.sedoparking.com/theverge.com': () => page('The Verge'),
      'https://theverge.com/feed': feed,
      'https://www.sedoparking.com/feed': feed,
    });
    expect((await a.action(api.catalog.find, { name: 'the verge' })).found).toEqual([]);
    expect(await a.query(api.catalog.search, { name: 'the verge' })).toEqual([]);
  });

  test('an unrelated site at a guessed address never appears', async () => {
    const { a } = await setup();
    web({ 'https://theverge.com/': () => page('Acme Plumbing Supplies', [FEED]), [FEED]: feed });
    expect((await a.action(api.catalog.find, { name: 'the verge' })).found).toEqual([]);
  });

  test('a site whose feed doesn’t parse never appears', async () => {
    const { a } = await setup();
    web({ 'https://theverge.com/': () => page('The Verge', [FEED]), [FEED]: () => page('Not a feed') });
    expect((await a.action(api.catalog.find, { name: 'the verge' })).found).toEqual([]);
  });

  test('candidates landing on one site collapse into one', async () => {
    const { a } = await setup();
    web({
      'https://theverge.net/': () => Response.redirect('https://www.theverge.com/', 301),
      'https://theverge.org/': () => Response.redirect('https://www.theverge.com/', 301),
      'https://www.theverge.com/': () => page('The Verge', [FEED]),
      [FEED]: feed,
    });
    expect((await a.action(api.catalog.find, { name: 'the verge' })).found).toEqual([FEED]);
  });
});

describe('a guessing search ends on time, and cancels what it no longer needs (FEE-109)', () => {
  /** Requests that never answer, each with the signal that should abort it. */
  const hanging: AbortSignal[] = [];
  const hang = (_url: string, init?: RequestInit) => {
    hanging.push(init!.signal!);
    return new Promise<Response>(() => {});
  };
  beforeEach(() => {
    hanging.length = 0;
    vi.useFakeTimers();
  });

  /** Runs `find` on the fake clock: how long it took (or null if still running at `limit`), and its answer. */
  async function timed(a: Awaited<ReturnType<typeof setup>>['a'], name: string, limit = 30_000) {
    let answer: { found: string[] } | undefined;
    const pending = a.action(api.catalog.find, { name }).then((result) => (answer = result));
    let elapsed = 0;
    while (answer === undefined && elapsed < limit) {
      await vi.advanceTimersByTimeAsync(100);
      elapsed += 100;
    }
    if (answer === undefined) return { elapsed: null, answer };
    await pending;
    return { elapsed, answer };
  }

  test('sites that never answer can\'t hold it past its 20-second deadline, and their requests are aborted', async () => {
    const { a } = await setup();
    network.mockImplementation(hang);
    const { elapsed, answer } = await timed(a, 'the verge');
    expect(elapsed).not.toBeNull();
    expect(elapsed!).toBeLessThanOrEqual(20_100);
    expect(answer).toEqual({ found: [] });
    expect(hanging.length).toBeGreaterThan(0);
    expect(hanging.filter((signal) => !signal.aborted)).toEqual([]);
  });

  test('a request started just before the deadline is cut at the deadline, not left to its own 10 seconds', async () => {
    const { a } = await setup();
    // Each site takes just under 10 seconds to say no, so a third round starts at 19.9 seconds.
    const started: { at: number; signal: AbortSignal }[] = [];
    network.mockImplementation((_url, init) => {
      started.push({ at: Date.now(), signal: init!.signal! });
      return new Promise((resolve) => setTimeout(() => resolve(new Response('', { status: 404 })), 9_950));
    });
    const begin = Date.now();
    const { elapsed } = await timed(a, 'daring fireball');
    expect(elapsed).not.toBeNull();
    expect(elapsed!).toBeLessThanOrEqual(20_100);
    const late = started.filter(({ at }) => at - begin > 19_000);
    expect(late.length).toBeGreaterThan(0);
    expect(late.every(({ signal }) => signal.aborted)).toBe(true);
  });

  test('a Feed proven before the deadline is still returned and remembered', async () => {
    const { a } = await setup();
    // A site with a near-matching name proves quickly but isn't the strong match, so the search goes on.
    const sites: Record<string, () => Response> = {
      'https://theverge.com/': () => page('Verge Weekly', [FEED]),
      [FEED]: feed,
    };
    network.mockImplementation(async (url, init) => (sites[url] ? sites[url]() : hang(url, init)));
    const { elapsed, answer } = await timed(a, 'the verge');
    expect(elapsed!).toBeLessThanOrEqual(20_100);
    expect(answer!.found).toEqual([FEED]);
    expect(await a.query(api.catalog.search, { name: 'verge weekly' })).toEqual([
      expect.objectContaining({ kind: 'new', url: FEED, host: 'theverge.com' }),
    ]);
  });

  test('a strong match ends it at once, and the requests still running are aborted', async () => {
    const { a } = await setup();
    const sites: Record<string, () => Response> = { 'https://theverge.com/': () => page('The Verge', [FEED]), [FEED]: feed };
    network.mockImplementation(async (url, init) => (sites[url] ? sites[url]() : hang(url, init)));
    const { elapsed, answer } = await timed(a, 'the verge');
    expect(elapsed!).toBeLessThanOrEqual(500);
    expect(answer!.found).toEqual([FEED]);
    expect(hanging.length).toBeGreaterThan(0);
    expect(hanging.filter((signal) => !signal.aborted)).toEqual([]);
  });

  test('it tries at most four sites at a time', async () => {
    const { a } = await setup();
    let inFlight = 0;
    let most = 0;
    network.mockImplementation(async () => {
      most = Math.max(most, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 200));
      inFlight--;
      return new Response('', { status: 404 });
    });
    await timed(a, 'daring fireball');
    expect(most).toBeGreaterThan(1);
    expect(most).toBeLessThanOrEqual(4);
  });
});

describe('what feedSmith already knows', () => {
  test('a strong catalog match shows at once, and nothing is guessed or fetched', async () => {
    const { a } = await setup();
    web({ 'https://theverge.com/': () => page('The Verge', [FEED]), [FEED]: feed });
    await a.action(api.catalog.find, { name: 'the verge' });
    network.mockClear();
    expect(await a.action(api.catalog.find, { name: 'The Verge' })).toEqual({ found: [] });
    expect(await a.query(api.catalog.search, { name: 'The Verge' })).toHaveLength(1);
    expect(fetched()).toEqual([]);
  });

  test('searching again for a shorter name of a found site fetches nothing', async () => {
    const { a } = await setup();
    web({ 'https://verge.com/': () => page('Verge Agency', ['https://verge.com/feed']), 'https://verge.com/feed': feed, 'https://theverge.com/': () => page('The Verge', [FEED]), [FEED]: feed });
    await a.action(api.catalog.find, { name: 'the verge' });
    network.mockClear();
    await a.action(api.catalog.find, { name: 'verge' });
    expect(fetched()).toEqual([]);
  });

  test('a look-alike naming itself after another site never stops the guessing', async () => {
    const { t, a } = await setup();
    await t.mutation(internal.catalog.remember, { ...ENTRY, url: 'https://evil.example.com/feed', host: 'evil.example.com', siteUrl: 'https://evil.example.com' });
    web({ 'https://theverge.com/': () => page('The Verge', [FEED]), [FEED]: feed });
    expect((await a.action(api.catalog.find, { name: 'the verge' })).found).toEqual([FEED]);
    const hosts = (await a.query(api.catalog.search, { name: 'the verge' })).map((found) => found.host);
    expect(hosts).toEqual(['theverge.com', 'evil.example.com']);
  });

  test('a name matching a Feed you follow fetches nothing at all', async () => {
    const { t, a, aId } = await setup();
    await t.run((ctx) => ctx.db.insert('feeds', { userId: aId, url: SECRET, title: 'The Verge', siteUrl: 'https://www.theverge.com' }));
    expect(await a.action(api.catalog.find, { name: 'the verge' })).toEqual({ found: [] });
    expect(fetched()).toEqual([]);
  });

  test('a weak catalog match stays in the list while guessing goes on', async () => {
    const { t, a } = await setup();
    await t.mutation(internal.catalog.remember, { ...ENTRY, url: 'https://vergeagency.com/feed', name: 'Verge Agency', host: 'vergeagency.com', siteUrl: 'https://vergeagency.com' });
    web({ 'https://theverge.com/': () => page('The Verge', [FEED]), [FEED]: feed });
    await a.action(api.catalog.find, { name: 'the verge' });
    const titles = (await a.query(api.catalog.search, { name: 'the verge' })).map((found) => found.title);
    expect(titles).toEqual(['The Verge', 'Verge Agency']);
  });

  test('a name matching a Feed you follow says so at once, by its id and never its URL (Q9), with no fetching', async () => {
    const { t, a, aId } = await setup();
    await t.run((ctx) => ctx.db.insert('feeds', { userId: aId, url: SECRET, title: 'The Verge', siteUrl: 'https://www.theverge.com' }));
    const found = await a.query(api.catalog.search, { name: 'the verge' });
    expect(found).toEqual([{ kind: 'following', feedId: expect.any(String), title: 'The Verge', host: 'theverge.com', iconUrl: 'https://www.theverge.com/favicon.ico' }]);
    expect(JSON.stringify(found)).not.toContain('SECRET');
    expect(fetched()).toEqual([]);
  });

  test('another User’s Feeds never show (Q10)', async () => {
    const { t, a, bId } = await setup();
    await t.run((ctx) => ctx.db.insert('feeds', { userId: bId, url: SECRET, title: 'The Verge', siteUrl: 'https://www.theverge.com' }));
    expect(await a.query(api.catalog.search, { name: 'the verge' })).toEqual([]);
  });

  test('a catalog Feed you already follow shows as followed, not as one to add', async () => {
    const { t, a, aId } = await setup();
    await t.mutation(internal.catalog.remember, ENTRY);
    await t.run((ctx) => ctx.db.insert('feeds', { userId: aId, url: FEED, title: 'Verge (mine)', siteUrl: 'https://www.theverge.com' }));
    expect(await a.query(api.catalog.search, { name: 'the verge' })).toEqual([
      expect.objectContaining({ kind: 'following', title: 'Verge (mine)' }),
    ]);
  });

  test('a typo the search index misses still shows once proven, asked for by address', async () => {
    const { t, a } = await setup();
    await t.mutation(internal.catalog.remember, { ...ENTRY, name: 'Daring Fireball', host: 'daringfireball.net', url: 'https://daringfireball.net/feed', siteUrl: 'https://daringfireball.net' });
    expect(await a.query(api.catalog.search, { name: 'darin fireball' })).toHaveLength(1);
    expect(await a.query(api.catalog.search, { name: 'daringfireboll' })).toEqual([]);
    expect(await a.query(api.catalog.search, { name: 'daringfireboll', also: ['https://daringfireball.net/feed'] })).toHaveLength(1);
  });
});

describe('keeping the catalog fresh', () => {
  test('found again, an entry takes its new name and icon', async () => {
    const { t, a } = await setup();
    await t.mutation(internal.catalog.remember, ENTRY);
    await t.mutation(internal.catalog.remember, { ...ENTRY, name: 'The Verge!', iconUrl: 'https://www.theverge.com/new.png', now: ENTRY.now + 1 });
    expect(await a.query(api.catalog.search, { name: 'the verge' })).toEqual([
      { kind: 'new', url: FEED, title: 'The Verge!', host: 'theverge.com', iconUrl: 'https://www.theverge.com/new.png' },
    ]);
  });

  test('entries unseen for a year are dropped; newer ones stay', async () => {
    const { t, a } = await setup();
    const now = Date.now();
    await t.mutation(internal.catalog.remember, { ...ENTRY, now: now - 366 * DAY });
    await t.mutation(internal.catalog.remember, { ...ENTRY, url: 'https://daringfireball.net/feed', name: 'Daring Fireball', host: 'daringfireball.net', siteUrl: 'https://daringfireball.net', now: now - 300 * DAY });
    await t.mutation(internal.catalog.forget, {});
    expect(await a.query(api.catalog.search, { name: 'the verge' })).toEqual([]);
    expect(await a.query(api.catalog.search, { name: 'daring fireball' })).toHaveLength(1);
  });

  test('the catalog holds no User id (Q28)', async () => {
    const { t } = await setup();
    await t.mutation(internal.catalog.remember, ENTRY);
    const [entry] = await t.run((ctx) => ctx.db.query('feedCatalog').take(5));
    expect(Object.keys(entry).sort()).toEqual(
      ['_creationTime', '_id', 'finds', 'host', 'iconUrl', 'name', 'searchText', 'seenAt', 'siteUrl', 'source', 'url'].filter((key) => key in entry).sort(),
    );
    expect(JSON.stringify(entry)).not.toMatch(/userId|users/);
  });
});

const DAY = 24 * 60 * 60_000;
/** A subscriber feed URL with a personal key in it (T9). */
const SECRET = 'https://www.theverge.com/rss/partner/subscriber-only-full-feed/rss.xml?key=SECRET-KEY-123';
const ENTRY = {
  url: FEED,
  name: 'The Verge',
  host: 'theverge.com',
  siteUrl: 'https://www.theverge.com',
  source: 'declared' as const,
  now: Date.now(),
};

describe('bounded (Q10)', () => {
  test('a name matching many of your Feeds lists at most twenty results', async () => {
    const { t, a, aId } = await setup();
    await t.run(async (ctx) => {
      for (let i = 0; i < 30; i++) await ctx.db.insert('feeds', { userId: aId, url: `https://news${i}.example.com/feed`, title: `News ${i}` });
    });
    expect(await a.query(api.catalog.search, { name: 'news' })).toHaveLength(20);
  });
});

describe('limiting guessing searches (FEE-88)', () => {
  /** A guessing search that finds nothing: every guess is a 404. */
  const guess = (as: Awaited<ReturnType<typeof setup>>['a'], name = 'the verge') => as.action(api.catalog.find, { name });

  test('past the allowance, a guessing search is refused before any fetch', async () => {
    const { a } = await setup();
    for (let i = 0; i < GUESSES_PER_HOUR; i++) expect(await guess(a)).toEqual({ found: [] });
    network.mockClear();
    expect(await guess(a)).toEqual({ found: [], limited: true });
    expect(fetched()).toEqual([]);
  });

  test('one User’s searches never use up another’s allowance', async () => {
    const { a, b } = await setup();
    for (let i = 0; i <= GUESSES_PER_HOUR; i++) await guess(a);
    expect(await guess(b)).toEqual({ found: [] });
  });

  test('searches answered without guessing are never charged', async () => {
    const { t, a, aId } = await setup();
    await t.run((ctx) => ctx.db.insert('feeds', { userId: aId, url: SECRET, title: 'Daring Fireball', siteUrl: 'https://daringfireball.net' }));
    await t.mutation(internal.catalog.remember, ENTRY);
    for (let i = 0; i < GUESSES_PER_HOUR * 2; i++) {
      await guess(a, 'daring fireball'); // a Feed you follow
      await guess(a, 'the verge'); // a strong catalog match
      await guess(a, '!!!'); // nothing to guess
    }
    network.mockClear();
    expect(await guess(a, 'kottke')).toEqual({ found: [] });
    expect(fetched().length).toBeGreaterThan(0);
  });

  test('a search racing an Account’s deletion leaves no counter behind (Q28)', async () => {
    const { t, aId } = await setup();
    await t.run((ctx) => ctx.db.delete(aId));
    expect(await t.mutation(internal.catalog.startGuessing, { userId: aId, name: 'the verge' })).toBe('known');
    const full = await t.run((ctx) => rateLimiter.check(ctx, 'guessingSearch', { key: aId, count: GUESSES_PER_HOUR }));
    expect(full.ok).toBe(true);
  });

  test('the allowance comes back with time, one search every few minutes', async () => {
    // Only the clock is faked: fetches still answer at once.
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const { a } = await setup();
      for (let i = 0; i < GUESSES_PER_HOUR; i++) await guess(a);
      expect(await guess(a)).toEqual({ found: [], limited: true });
      vi.setSystemTime(Date.now() + (60 * 60_000) / GUESSES_PER_HOUR);
      expect(await guess(a)).toEqual({ found: [] });
      expect(await guess(a)).toEqual({ found: [], limited: true });
    } finally {
      vi.useRealTimers();
    }
  });
});
