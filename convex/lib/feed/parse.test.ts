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
