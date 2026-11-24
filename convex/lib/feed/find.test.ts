import { describe, expect, test } from 'vitest';

import { candidates, hostMatch, isStrong, looksParked, MAX_CANDIDATES, nameMatch, rank } from './find';
import { isAddress } from './typed';

describe('telling a name from an address', () => {
  test.each([
    ['theverge.com', true],
    ['https://www.theverge.com/rss/index.xml', true],
    ['daringfireball.net/feed', true],
    ['  theverge.com  ', true],
    ['the verge', false],
    ['theverge', false],
    ['Daring Fireball', false],
    ['the verge.com', false],
    ['...', false],
  ])('%s → address: %s', (typed, address) => {
    expect(isAddress(typed)).toBe(address);
  });
});

describe('candidate addresses', () => {
  test('"The Verge": squashed forms on the likely endings, then the hosted-blog platforms, in a fixed order', () => {
    expect(candidates('The Verge')).toEqual([
      'theverge.com',
      'theverge.net',
      'theverge.org',
      'verge.com',
      'the-verge.com',
      'theverge.blog',
      'theverge.io',
      'theverge.co',
      'theverge.dev',
      'theverge.substack.com',
      'theverge.wordpress.com',
      'theverge.blogspot.com',
      'theverge.ghost.io',
      'theverge.tumblr.com',
      'theverge.micro.blog',
      'theverge.bearblog.dev',
    ]);
  });

  test('"Daring Fireball" tries .net second', () => {
    expect(candidates('Daring Fireball').slice(0, 4)).toEqual(['daringfireball.com', 'daringfireball.net', 'daringfireball.org', 'daring-fireball.com']);
  });

  test('accents and punctuation fold away; "&" reads as "and"', () => {
    expect(candidates('Café & Co.')[0]).toBe('cafeandco.com');
  });

  test.each([
    ['blank', ''],
    ['only filler words', 'the a an'],
    ['too many words', 'one two three four five six seven'],
    ['too long', 'x'.repeat(101)],
    ['no letters', '!!! ???'],
    ['a label over 63 characters', 'a'.repeat(64)],
  ])('%s gives no candidates', (_case, name) => {
    expect(candidates(name)).toEqual([]);
  });

  test('never more than the cap, every one a plain host', () => {
    for (const name of ['the verge', 'a b c d e f', 'x-y', '9to5mac']) {
      const hosts = candidates(name);
      expect(hosts.length).toBeLessThanOrEqual(MAX_CANDIDATES);
      for (const host of hosts) expect(host).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
    }
  });
});

describe('matching a site’s own name', () => {
  test.each([
    ['the verge', 'The Verge', 3],
    ['theverge', 'The Verge', 3],
    ['verge', 'The Verge', 3],
    ['daring fireball', 'Daring Fireball', 3],
    ['daring fireball', 'Daring Fireball – by John Gruber', 3],
    ['verge', 'Verge Agency', 2],
    ['stratechery', 'Stratechery by Ben Thompson – On the business, strategy, and impact of technology.', 3],
    ['daring fireball', 'Daring Fireball Linked List and Other Things', 2],
    ['daring fireboll', 'Daring Fireball', 1],
    ['the verge', 'Acme Plumbing Supplies', 0],
    ['the verge', 'Vergence Labs International Holdings', 0],
    ['the', 'The Verge', 0],
  ])('"%s" against "%s" → %i', (typed, site, score) => {
    expect(nameMatch(typed, site)).toBe(score);
  });

  test('the host matches when it is the name squashed, on a platform by its subdomain', () => {
    expect(hostMatch('the verge', 'www.theverge.com')).toBe(true);
    expect(hostMatch('the verge', 'the-verge.com')).toBe(true);
    expect(hostMatch('stratechery', 'stratechery.substack.com')).toBe(true);
    expect(hostMatch('the verge', 'vergeagency.com')).toBe(false);
  });

  test('strong: the same name on the site of that name, not a look-alike elsewhere', () => {
    expect(isStrong('the verge', { name: 'The Verge', host: 'theverge.com' })).toBe(true);
    expect(isStrong('the verge', { name: 'The Verge', host: 'evil.example' })).toBe(false);
    // A hosted-blog subdomain may be an old or someone else's blog: the site's own domain is still guessed.
    expect(isStrong('stratechery', { name: 'Stratechery', host: 'stratechery.wordpress.com' })).toBe(false);
    expect(isStrong('stratechery', { name: 'Stratechery by Ben Thompson', host: 'stratechery.com' })).toBe(true);
  });
});

describe('parked domains', () => {
  const site = (body: string, head = '<title>x</title>') => `<html><head>${head}</head><body>${body}</body></html>`;

  test.each([
    ['for sale', site('<h1>This domain is for sale!</h1>')],
    ['buy this domain', site('<p>Buy this domain. Contact us.</p>')],
    ['parked', site('<p>This domain is parked free, courtesy of a registrar.</p>')],
    ['related searches', site('<p>Related Searches: news, tech, gadgets</p>')],
  ])('says it is parked (%s)', (_case, html) => {
    expect(looksParked(html, 'https://theverge.com/', false)).toBe(true);
  });

  test('a parking service host is parked whatever it says', () => {
    expect(looksParked(site('<p>A perfectly ordinary page of words about things.</p>'), 'https://www.sedoparking.com/x', false)).toBe(true);
  });

  test('near-empty is parked, unless it declares a feed of its own', () => {
    const empty = site('<div id="root"></div><script>var lots = "of words that are not shown to anyone at all";</script>');
    expect(looksParked(empty, 'https://theverge.com/', false)).toBe(true);
    expect(looksParked(empty, 'https://theverge.com/', true)).toBe(false);
  });

  test('a real site is not parked', () => {
    expect(looksParked(site('<h1>The Verge</h1><p>Technology news and reviews, every day.</p>'), 'https://theverge.com/', false)).toBe(false);
  });
});

describe('ranking', () => {
  const entry = (name: string, host: string, extra: Partial<{ source: 'declared' | 'common-path'; finds: number }> = {}) => ({
    name,
    host,
    source: 'declared' as const,
    finds: 1,
    ...extra,
  });

  test('a site’s own domain ranks above a hosted-blog subdomain of the same name', () => {
    const ranked = rank('stratechery', [
      { name: 'Stratechery', host: 'stratechery.wordpress.com', source: 'declared' as const, finds: 1 },
      { name: 'Stratechery by Ben Thompson', host: 'stratechery.com', source: 'common-path' as const, finds: 1 },
    ]);
    expect(ranked.map((found) => found.host)).toEqual(['stratechery.com', 'stratechery.wordpress.com']);
  });

  test('stronger name, then the host of that name, then known, then declared, then .com and shorter', () => {
    const ranked = rank('the verge', [
      entry('Verge Agency', 'vergeagency.com'),
      entry('The Verge', 'vergemedia.net', { finds: 9 }),
      entry('The Verge', 'theverge.net', { source: 'common-path' }),
      entry('The Verge', 'theverge.com', { source: 'common-path' }),
      entry('The Verge', 'theverge.com.au', { finds: 3 }),
    ]);
    expect(ranked.map((found) => found.host)).toEqual(['theverge.com.au', 'theverge.com', 'theverge.net', 'vergemedia.net', 'vergeagency.com']);
  });
});
