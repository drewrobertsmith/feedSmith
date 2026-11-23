/// <reference types="vite/client" />
import { Effect, Exit } from 'effect';
import { describe, expect, test } from 'vitest';

import atom from './fixtures/atom.xml?raw';
import verge from './fixtures/verge.xml?raw';
import { MAX_ARTICLES, parseFeed } from './parse';

const NOW = Date.parse('2026-11-21T12:00:00Z');
const parse = (xml: string) => Effect.runSync(parseFeed(xml, NOW));
const failure = (xml: string) => {
  const exit = Effect.runSyncExit(parseFeed(xml, NOW));
  return Exit.isFailure(exit) ? exit.cause.toString() : 'succeeded';
};

describe('RSS 2.0: The Verge subscriber feed', () => {
  const feed = parse(verge);

  test('reads the Feed title', () => {
    expect(feed.title).toBe('The Verge - Full RSS for subscribers | The Verge');
  });

  test('reads every Article, newest first, with title, link, guid, date and Subtitle', () => {
    expect(feed.articles).toHaveLength(3);
    const [first] = feed.articles;
    expect(first.title).toBe('The UN fails to agree on rules regulating ‘killer robots’');
    expect(first.link).toBe('https://www.theverge.com/tech/1039554/un-regulations-killer-robots');
    expect(first.guid).toBe('https://www.theverge.com/?p=1039554');
    expect(first.publishedAt).toBe(Date.parse('Sat, 21 Nov 2026 15:03:37 -0500'));
    expect(first.subtitle).toBe('Countries agree to ‘start discussing options’ for rules around autonomous weapons.');
    const dates = feed.articles.map((a) => a.publishedAt);
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  test("keeps each Article's full text from content:encoded (T8)", () => {
    expect(feed.articles[0].html).toMatch(/<p[\s>]/);
  });
});

describe('Atom', () => {
  const feed = parse(atom);

  test('reads the Feed and its entries, newest first', () => {
    expect(feed.title).toBe('Example Atom Feed');
    expect(feed.articles.map((a) => a.title)).toEqual(['Newer & better', 'Older entry']);
  });

  test('takes the alternate link, the id as guid, and published or updated as the date', () => {
    const [newer, older] = feed.articles;
    expect(newer.link).toBe('https://atom.example.com/newer');
    expect(newer.guid).toBe('urn:uuid:2');
    expect(newer.publishedAt).toBe(Date.parse('2026-11-20T18:30:02Z'));
    expect(older.publishedAt).toBe(Date.parse('2026-11-18T09:00:00Z'));
  });

  test('reads html and xhtml content, and keeps the Subtitle as plain text', () => {
    const [newer, older] = feed.articles;
    expect(older.html).toBe('<p>Older <em>body</em>.</p>');
    expect(newer.html).toContain('<strong>xhtml</strong>');
    expect(newer.subtitle).toBe('Newer summary.');
  });
});

describe('untrusted feeds', () => {
  test.each([
    ['an HTML page', '<!doctype html><html><head><title>Site</title></head><body><p>Hi</p></body></html>'],
    ['plain text', 'just some words'],
    ['empty', ''],
  ])('%s is not a feed', (_case, body) => {
    expect(failure(body)).toContain('NotAFeed');
  });

  test('DOCTYPE entities are never expanded', () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY lol "lollollollollollollollol">]>
      <rss version="2.0"><channel><title>&lol;&lol;</title><item><title>&lol;</title><guid>1</guid></item></channel></rss>`;
    const feed = parse(xml);
    expect(feed.title).not.toContain('lollol');
    expect(JSON.stringify(feed)).not.toContain('lollollol');
  });

  test(`keeps only the newest ${MAX_ARTICLES} of a huge feed`, () => {
    const items = Array.from(
      { length: 10_000 },
      (_, i) => `<item><title>A${i}</title><guid>g${i}</guid><pubDate>${new Date(NOW - i * 60_000).toUTCString()}</pubDate></item>`,
    ).join('');
    const feed = parse(`<rss version="2.0"><channel><title>Big</title>${items}</channel></rss>`);
    expect(feed.articles).toHaveLength(MAX_ARTICLES);
    expect(feed.articles[0].title).toBe('A0');
  });

  test('a non-https Article link is dropped; a missing date becomes the fetch time; a missing guid falls back to the link', () => {
    const xml = `<rss version="2.0"><channel><title>T</title>
      <item><title>One</title><link>http://insecure.example/1</link><guid>1</guid></item>
      <item><title>Two</title><link>https://ok.example/2</link></item>
    </channel></rss>`;
    const [one, two] = parse(xml).articles;
    expect(one.link).toBeUndefined();
    expect(one.publishedAt).toBe(NOW);
    expect(two.guid).toBe('https://ok.example/2');
  });

  test('an Article with no title, guid or link is skipped', () => {
    const xml = `<rss version="2.0"><channel><title>T</title><item><description>x</description></item></channel></rss>`;
    expect(parse(xml).articles).toEqual([]);
  });

  test('titles and Subtitles are capped', () => {
    const long = 'x'.repeat(5000);
    const xml = `<rss version="2.0"><channel><title>${long}</title><item><title>${long}</title><guid>1</guid><description>${long}</description></item></channel></rss>`;
    const feed = parse(xml);
    expect(feed.title.length).toBeLessThanOrEqual(200);
    expect(feed.articles[0].title.length).toBeLessThanOrEqual(300);
    expect(feed.articles[0].subtitle!.length).toBeLessThanOrEqual(500);
  });
});

describe('lead images and the site (FEE-27)', () => {
  const item = (inner: string) =>
    `<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>T</title><link>https://site.example.com/</link><item><title>A</title><guid>1</guid>${inner}</item></channel></rss>`;

  test.each([
    ['media:content', '<media:content url="https://cdn.example.com/a.jpg" medium="image"/>'],
    ['media:content by type', '<media:content url="https://cdn.example.com/a.jpg" type="image/jpeg"/>'],
    ['media:thumbnail', '<media:thumbnail url="https://cdn.example.com/a.jpg"/>'],
    ['an image enclosure', '<enclosure url="https://cdn.example.com/a.jpg" type="image/jpeg" length="1"/>'],
  ])('an RSS Article takes its lead image from %s', (_case, inner) => {
    expect(parse(item(inner)).articles[0].imageUrl).toBe('https://cdn.example.com/a.jpg');
  });

  test.each([
    ['an http image', '<media:thumbnail url="http://cdn.example.com/a.jpg"/>'],
    ['a javascript: URL', '<media:thumbnail url="javascript:alert(1)"/>'],
    ['a data: URL', '<media:thumbnail url="data:image/png;base64,AAAA"/>'],
    ['a video enclosure', '<enclosure url="https://cdn.example.com/a.mp4" type="video/mp4" length="1"/>'],
    ['an oversized URL', `<media:thumbnail url="https://cdn.example.com/${'a'.repeat(3000)}.jpg"/>`],
  ])('%s is never a lead image', (_case, inner) => {
    expect(parse(item(inner)).articles[0].imageUrl).toBeUndefined();
  });

  test("an Atom entry takes its lead image from an image enclosure", () => {
    const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><title>T</title><link href="https://atom.example.com/"/>
      <entry><title>A</title><id>1</id><link rel="enclosure" type="image/png" href="https://cdn.example.com/b.png"/></entry></feed>`;
    expect(parse(xml).articles[0].imageUrl).toBe('https://cdn.example.com/b.png');
  });

  test("the Feed's site comes from its own link: https only, origin only", () => {
    expect(parse(item('')).siteUrl).toBe('https://site.example.com');
    expect(parse(verge).siteUrl).toBe('https://www.theverge.com');
    expect(parse(atom).siteUrl).toBe('https://atom.example.com');
    expect(parse(item('').replace('https://site.example.com/', 'http://site.example.com/')).siteUrl).toBeUndefined();
    expect(parse(item('').replace('https://site.example.com/', 'https://site.example.com/path?key=1')).siteUrl).toBe(
      'https://site.example.com',
    );
  });
});

describe("an Article's authors (FEE-41)", () => {
  const rssItem = (inner: string) =>
    `<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>T</title><item><title>A</title><guid>1</guid>${inner}</item></channel></rss>`;
  const atomEntry = (inner: string) =>
    `<feed xmlns="http://www.w3.org/2005/Atom"><title>T</title><entry><id>1</id><title>A</title>${inner}</entry></feed>`;
  const authorsOf = (xml: string) => parse(xml).articles[0].authors;

  test("The Verge's Articles carry their authors from dc:creator", () => {
    expect(parse(verge).articles.map((a) => a.authors)).toEqual([['Terrence O’Brien'], ['Terrence O’Brien'], ['Sheena Vasani']]);
  });

  test.each([
    ['RSS dc:creator, several', rssItem('<dc:creator>Emma Roth</dc:creator><dc:creator>Jay Peters</dc:creator>'), ['Emma Roth', 'Jay Peters']],
    ['an RSS author given as email (name)', rssItem('<author>emma@example.com (Emma Roth)</author>'), ['Emma Roth']],
    ['an Atom author', atomEntry('<author><name>John Gruber</name></author>'), ['John Gruber']],
    ['several Atom authors', atomEntry('<author><name>A. One</name></author><author><name>B. Two</name></author>'), ['A. One', 'B. Two']],
    ['the same name twice', rssItem('<dc:creator>Emma Roth</dc:creator><author>e@example.com (Emma Roth)</author>'), ['Emma Roth']],
    ['a name with markup and spacing', rssItem('<dc:creator><![CDATA[  <b>Emma</b>   Roth ]]></dc:creator>'), ['Emma Roth']],
    ['a name with a role in brackets, kept as written', rssItem('<dc:creator>Jane Doe (Editor)</dc:creator>'), ['Jane Doe (Editor)']],
    ['a name followed by its email in brackets', rssItem('<dc:creator>Emma Roth (emma@example.com)</dc:creator>'), ['Emma Roth']],
  ])('reads %s', (_case, xml, authors) => {
    expect(authorsOf(xml)).toEqual(authors);
  });

  test.each([
    ['a bare email', rssItem('<author>emma@example.com</author>')],
    ['an email inside a name', rssItem('<dc:creator>Emma Roth (emma@example.com)</dc:creator>')],
    ['an Atom author with only an email', atomEntry('<author><email>emma@example.com</email></author>')],
  ])('never keeps an email address: %s', (_case, xml) => {
    expect(JSON.stringify(parse(xml).articles[0])).not.toContain('@');
  });

  test('an Article with no author has none', () => {
    expect(authorsOf(rssItem(''))).toBeUndefined();
  });

  test('authors are capped in number and length', () => {
    const many = Array.from({ length: 30 }, (_, i) => `<dc:creator>Writer ${i}</dc:creator>`).join('');
    expect(authorsOf(rssItem(many))).toHaveLength(10);
    expect(authorsOf(rssItem(`<dc:creator>${'N'.repeat(500)}</dc:creator>`))![0]).toHaveLength(100);
  });
});
