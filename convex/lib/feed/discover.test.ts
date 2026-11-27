import { describe, expect, test } from 'vitest';

import { findFeedLinks, MAX_FEED_LINKS, siteMeta } from './discover';
import twins from './fixtures/page-format-twins.html?raw';

const PAGE = 'https://www.example.com/';
const head = (inner: string) => `<!doctype html><html><head>${inner}</head><body><p>Hi</p></body></html>`;

describe("a page's feed links (T21)", () => {
  test('RSS and Atom alternate links, resolved against the page, with their titles', () => {
    const html = head(`
      <link rel="alternate" type="application/rss+xml" title="All posts" href="/rss/index.xml">
      <link rel="alternate" type="application/atom+xml" title="Reviews" href="https://www.example.com/reviews.atom">
      <link rel="alternate" hreflang="fr" href="/fr/">
      <link rel="stylesheet" href="/s.css">`);
    expect(findFeedLinks(html, PAGE)).toEqual([
      { url: 'https://www.example.com/rss/index.xml', title: 'All posts' },
      { url: 'https://www.example.com/reviews.atom', title: 'Reviews' },
    ]);
  });

  test("one feed in two formats is one feed: Atom, with its RSS twin noted (FEE-133)", () => {
    // React Native's blog, as served: unquoted attributes, RSS listed first, a JSON Feed beside them.
    expect(findFeedLinks(twins, 'https://reactnative.dev/blog')).toEqual([
      { url: 'https://reactnative.dev/blog/atom.xml', title: 'React Native Atom Feed', twins: ['https://reactnative.dev/blog/rss.xml'] },
    ]);
  });

  test('RSS and Atom in different folders, or two of one format, are different feeds (FEE-133)', () => {
    const folders = head(`
      <link rel="alternate" type="application/rss+xml" title="Posts" href="/posts/rss.xml">
      <link rel="alternate" type="application/atom+xml" title="Notes" href="/notes/atom.xml">`);
    expect(findFeedLinks(folders, PAGE).map((link) => link.url)).toEqual([
      'https://www.example.com/posts/rss.xml',
      'https://www.example.com/notes/atom.xml',
    ]);
    const crowded = head(`
      <link rel="alternate" type="application/rss+xml" title="Posts" href="/blog/rss.xml">
      <link rel="alternate" type="application/rss+xml" title="Comments" href="/blog/comments.xml">
      <link rel="alternate" type="application/atom+xml" title="Posts, Atom" href="/blog/atom.xml">`);
    // Comments are a feed of their own; the posts' RSS and Atom are one.
    expect(findFeedLinks(crowded, PAGE).map((link) => link.title)).toEqual(['Comments', 'Posts, Atom']);
    // Two generic feeds of one format beside an Atom one: no telling which is its twin, so all three are offered.
    const ambiguous = head(`
      <link rel="alternate" type="application/rss+xml" title="A" href="/blog/rss.xml">
      <link rel="alternate" type="application/rss+xml" title="B" href="/blog/feed.xml">
      <link rel="alternate" type="application/atom+xml" title="C" href="/blog/atom.xml">`);
    expect(findFeedLinks(ambiguous, PAGE)).toHaveLength(3);
    // Named for what they hold, not their format: two feeds, though they share a folder.
    const named = head(`
      <link rel="alternate" type="application/rss+xml" title="All posts" href="/rss.xml">
      <link rel="alternate" type="application/atom+xml" title="Reviews" href="/reviews.atom">`);
    expect(findFeedLinks(named, PAGE)).toHaveLength(2);
    const elsewhere = head(`
      <link rel="alternate" type="application/rss+xml" title="Ours" href="/blog/rss.xml">
      <link rel="alternate" type="application/atom+xml" title="Theirs" href="https://other.example.com/blog/atom.xml">`);
    expect(findFeedLinks(elsewhere, PAGE)).toHaveLength(2);
  });

  test('a link without a title is named by its address', () => {
    const html = head('<link rel="alternate" type="application/rss+xml" href="/feed">');
    expect(findFeedLinks(html, PAGE)).toEqual([{ url: 'https://www.example.com/feed', title: 'www.example.com/feed' }]);
  });

  test.each([
    ['javascript:', 'javascript:alert(1)'],
    ['http', 'http://www.example.com/feed'],
    ['a private address', 'https://169.254.169.254/feed'],
    ['localhost', 'https://localhost/feed'],
    ['a data: URL', 'data:application/rss+xml,<rss/>'],
    ['credentials', 'https://user:pass@www.example.com/feed'],
  ])('a link to %s is never offered (T18)', (_case, href) => {
    expect(findFeedLinks(head(`<link rel="alternate" type="application/rss+xml" href="${href}">`), PAGE)).toEqual([]);
  });

  test(`at most ${MAX_FEED_LINKS} links, each address once`, () => {
    const links = Array.from({ length: 50 }, (_, i) => `<link rel="alternate" type="application/rss+xml" href="/f${i % 30}">`).join('');
    const found = findFeedLinks(head(links), PAGE);
    expect(found).toHaveLength(MAX_FEED_LINKS);
    expect(new Set(found.map((f) => f.url)).size).toBe(MAX_FEED_LINKS);
  });

  test('titles are plain and capped', () => {
    const html = head(`<link rel="alternate" type="application/rss+xml" title="&lt;b&gt;${'x'.repeat(500)}" href="/f">`);
    const [link] = findFeedLinks(html, PAGE);
    expect(link.title.length).toBeLessThanOrEqual(100);
    expect(link.title.startsWith('<b>')).toBe(true);
  });

  test('a link too long to be a Feed address is never offered', () => {
    const html = head(`<link rel="alternate" type="application/rss+xml" href="/${'a'.repeat(3000)}">`);
    expect(findFeedLinks(html, PAGE)).toEqual([]);
  });

  test("only the page's head is read: links after <body> don't count", () => {
    const html = `<html><head><title>T</title></head><body><link rel="alternate" type="application/rss+xml" href="/late"></body></html>`;
    expect(findFeedLinks(html, PAGE)).toEqual([]);
  });

  test('a page with no feed links has none', () => {
    expect(findFeedLinks(head('<title>Shop</title>'), PAGE)).toEqual([]);
    expect(findFeedLinks('not html at all', PAGE)).toEqual([]);
  });
});

describe("a site's name and icon (T21)", () => {
  test('og:site_name first, then application-name, then the title', () => {
    expect(siteMeta(head('<meta property="og:site_name" content="The Verge"><title>The Verge – Tech</title>'), PAGE).name).toBe('The Verge');
    expect(siteMeta(head('<meta name="application-name" content="Calm Notes"><title>Home</title>'), PAGE).name).toBe('Calm Notes');
    expect(siteMeta(head('<title>  Farnam Street  </title>'), PAGE).name).toBe('Farnam Street');
    expect(siteMeta(head(''), PAGE).name).toBeUndefined();
  });

  // FEE-89: a name taken from the page's <title> keeps only the part before its tagline or byline.
  test.each([
    [
      'a tagline after a colon',
      'Pluralistic: Daily links from Cory Doctorow – No trackers, no ads. Black type, white background. Privacy respecting.',
      'Pluralistic',
    ],
    ['a byline, then a tagline', 'Stratechery by Ben Thompson – On the business, strategy, and impact of technology.', 'Stratechery'],
    ['a tagline after a bar', 'Calm Notes | Writing about slowness', 'Calm Notes'],
    ['no tagline: kept whole', 'Farnam Street', 'Farnam Street'],
    ['all tagline, nothing before it: kept whole', ': Daily links', ': Daily links'],
  ])('a page-title name with %s', (_case, title, name) => {
    const meta = siteMeta(head(`<title>${title}</title>`), PAGE);
    expect(meta.name).toBe(name);
    // What the whole title used to give, so a Feed named by it before can be recognised (and shortened once).
    expect(meta.pageTitle).toBe(title.slice(0, 100));
  });

  test("a name the site states itself is never cut, and isn't a page title", () => {
    const meta = siteMeta(head('<meta property="og:site_name" content="Stratechery by Ben Thompson"><title>Stratechery by Ben Thompson – On…</title>'), PAGE);
    expect(meta.name).toBe('Stratechery by Ben Thompson');
    expect(meta.pageTitle).toBeUndefined();
    expect(siteMeta(head('<meta name="application-name" content="Notes: A Blog">'), PAGE).name).toBe('Notes: A Blog');
  });

  test('the icon: apple-touch-icon first, then icon, https only', () => {
    expect(siteMeta(head('<link rel="icon" href="/i.png"><link rel="apple-touch-icon" href="/touch.png">'), PAGE).iconUrl).toBe(
      'https://www.example.com/touch.png',
    );
    expect(siteMeta(head('<link rel="shortcut icon" href="/favicon.png">'), PAGE).iconUrl).toBe('https://www.example.com/favicon.png');
    expect(siteMeta(head('<link rel="icon" href="http://www.example.com/i.png">'), PAGE).iconUrl).toBeUndefined();
    expect(siteMeta(head('<link rel="icon" href="data:image/png;base64,AAAA">'), PAGE).iconUrl).toBeUndefined();
    // The phone loads it: never a local-network or IP address (T18).
    expect(siteMeta(head('<link rel="icon" href="https://192.168.0.1/i.png">'), PAGE).iconUrl).toBeUndefined();
    expect(siteMeta(head('<link rel="icon" href="https://localhost/i.png">'), PAGE).iconUrl).toBeUndefined();
  });

  test('a name is plain and capped', () => {
    expect(siteMeta(head(`<title>${'n'.repeat(500)}</title>`), PAGE).name!.length).toBeLessThanOrEqual(100);
  });
});
