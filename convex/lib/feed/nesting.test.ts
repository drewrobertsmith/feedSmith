import { describe, expect, test } from 'vitest';

import { MAX_NESTING, boundNesting } from './nesting';

const deep = (tag: string, n: number) => `${`<${tag}>`.repeat(n)}deep${`</${tag}>`.repeat(n)}`;
const ms = (f: () => unknown) => {
  const start = performance.now();
  f();
  return performance.now() - start;
};

describe('ordinary markup passes through untouched (FEE-57)', () => {
  test.each([
    ['a nested article', `<article><div><p>One <em>two <a href="x">three</a></em></p></div></article>`],
    ['paragraphs left open', '<p>one'.repeat(5000)],
    ['list items left open', `<ul>${'<li>x'.repeat(5000)}</ul>`],
    ['table cells left open', `<table>${'<tr><td>x<td>y'.repeat(2000)}</table>`],
    ['void elements', '<br><img src="a"><hr><input><meta charset="x"><link rel="a">'.repeat(2000)],
    ['self-closing tags', '<span/>'.repeat(5000)],
    ['comments full of tags', `<!--${'<div>'.repeat(5000)}-->`],
    ['scripts full of tags', `<script>${'document.write("<div>");'.repeat(5000)}</script><p>after</p>`],
    ['styles full of angle brackets', `<style>${'a > b { }'.repeat(5000)}</style>`],
    ['a doctype and processing instruction', '<!DOCTYPE html><?xml version="1.0"?><html><body>x</body></html>'],
    ['a stray angle bracket', `${'1 < 2 and 3 > 2. '.repeat(5000)}<p>after</p>`],
  ])('%s', (_name, markup) => {
    expect(boundNesting(markup)).toBe(markup);
  });

  test('nesting right up to the limit is kept whole', () => {
    const markup = deep('div', MAX_NESTING);
    expect(boundNesting(markup)).toBe(markup);
  });
});

describe('hostile nesting is cut where it passes the limit (Q8)', () => {
  test('a 50,000-deep document keeps only what comes before the limit', () => {
    const bounded = boundNesting(`<p>Before</p>${deep('div', 50_000)}`);
    expect(bounded.startsWith('<p>Before</p>')).toBe(true);
    expect(bounded.match(/<div>/g)).toHaveLength(MAX_NESTING);
    expect(bounded).not.toContain('deep');
  });

  test('in a feed (XML), only self-closing tags are free', () => {
    const xml = `<rss><channel>${deep('x', 50_000)}</channel></rss>`;
    const bounded = boundNesting(xml, { xml: true });
    expect(bounded.length).toBeLessThan(xml.length);
    expect(bounded.match(/<x>/g)!.length).toBeLessThanOrEqual(MAX_NESTING);
    // In XML, <p> and <br> are ordinary elements, so they count.
    expect(boundNesting('<p>'.repeat(5000), { xml: true }).match(/<p>/g)!.length).toBeLessThanOrEqual(MAX_NESTING);
    const flat = '<item/>'.repeat(5000);
    expect(boundNesting(flat, { xml: true })).toBe(flat);
  });

  test('the scan is linear: 2 MB of hostile nesting is bounded in well under a tenth of a second', () => {
    const markup = deep('span', 160_000);
    expect(markup.length).toBeGreaterThan(2_000_000);
    expect(ms(() => boundNesting(markup))).toBeLessThan(100);
  });
});
