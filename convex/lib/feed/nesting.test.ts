import { Parser } from 'htmlparser2';
import { parseHTML } from 'linkedom';
import { describe, expect, test } from 'vitest';

import { MAX_NESTING, boundNesting } from './nesting';

const deep = (tag: string, n: number) => `${`<${tag}>`.repeat(n)}deep${`</${tag}>`.repeat(n)}`;

/** How deep the parser itself nests `markup`: the cost FEE-57 bounds. */
function parserDepth(markup: string, xml = false): number {
  let depth = 0;
  let deepest = 0;
  const parser = new Parser(
    {
      onopentagname() {
        deepest = Math.max(deepest, ++depth);
      },
      onclosetag() {
        depth--;
      },
    },
    { xmlMode: xml },
  );
  parser.end(markup);
  return deepest;
}

/** How deep linkedom's DOM nests, for Readability: the element under `body` with the most ancestors. */
function domDepth(markup: string): number {
  const { document } = parseHTML(markup);
  let deepest = 0;
  const walk = (node: { children?: ArrayLike<unknown> }, depth: number) => {
    deepest = Math.max(deepest, depth);
    for (const child of Array.from(node.children ?? [])) walk(child as typeof node, depth + 1);
  };
  // Iterative enough at the bounded depth; unbounded input would never reach here in the app.
  walk(document.documentElement as unknown as { children?: ArrayLike<unknown> }, 0);
  return deepest;
}

describe('ordinary markup passes through untouched (FEE-57)', () => {
  test.each([
    ['a nested article', `<article><div><p>One <em>two <a href="x">three</a></em></p></div></article>`],
    ['paragraphs left open', '<p>one'.repeat(5000)],
    ['list items left open', `<ul>${'<li>x'.repeat(5000)}</ul>`],
    ['table cells left open', `<table>${'<tr><td>x<td>y'.repeat(2000)}</table>`],
    ['void elements', '<br><img src="a"><hr><input><meta charset="x"><link rel="a">'.repeat(2000)],
    ['an inline SVG full of self-closing shapes', `<svg>${'<path d="M0 0"/>'.repeat(5000)}</svg>`],
    ['comments full of tags', `<!--${'<div>'.repeat(5000)}-->`],
    ['scripts full of tags', `<script>${'document.write("<div>");'.repeat(5000)}</script><p>after</p>`],
    ['a stray angle bracket', `${'1 < 2 and 3 > 2. '.repeat(5000)}<p>after</p>`],
    ['links one after another', '<a href="x">one</a> '.repeat(5000)],
    // htmlparser2 closes an open link or heading when the next one opens, so neither nests.
    ['links left open', '<a href="x">one'.repeat(5000)],
    ['headings left open', '<h2>one'.repeat(5000)],
  ])('%s', (_name, markup) => {
    expect(boundNesting(markup)).toBe(markup);
  });

  test('a feed of many flat items is kept whole', () => {
    const xml = `<rss><channel>${'<item><title>t</title><br/></item>'.repeat(5000)}</channel></rss>`;
    expect(boundNesting(xml, { xml: true })).toBe(xml);
  });

  test('nesting right up to the limit is kept whole', () => {
    const markup = deep('div', MAX_NESTING);
    expect(boundNesting(markup)).toBe(markup);
  });
});

describe('hostile nesting is cut where it passes the limit, whatever form it takes (Q8)', () => {
  // Each nests thousands deep in the parser; several slipped past a scanner that copied its rules.
  const HOSTILE: [string, string][] = [
    ['divs', deep('div', 5_000)],
    ['spans in a paragraph', `<p>${deep('span', 5_000)}</p>`],
    ['"self-closing" tags HTML ignores the slash on', '<b/>'.repeat(5_000)],
    ['a slash inside an unquoted attribute', '<b href=x/>'.repeat(5_000)],
    ['a "/>" inside a quoted attribute', '<b a="/>">'.repeat(5_000)],
    ['table sections nothing closes', '<thead>'.repeat(5_000)],
    ['captions', '<caption>'.repeat(5_000)],
    ['paragraphs and list items taking turns', '<p><li>'.repeat(2_500)],
    ['closers for elements that were never opened', '<div></x>'.repeat(5_000)],
    ['an element inside an SVG drawing', `<svg><foreignObject>${'<div/>'.repeat(5_000)}`],
  ];

  test.each(HOSTILE)('%s', (_name, markup) => {
    expect(parserDepth(markup)).toBeGreaterThan(1000);
    const bounded = boundNesting(markup);
    expect(parserDepth(bounded)).toBeLessThanOrEqual(MAX_NESTING);
    expect(domDepth(bounded)).toBeLessThanOrEqual(MAX_NESTING + 2);
  });

  test('what comes before the nesting is kept', () => {
    const bounded = boundNesting(`<p>Before</p>${deep('div', 50_000)}`);
    expect(bounded.startsWith('<p>Before</p>')).toBe(true);
    expect(bounded).not.toContain('deep');
  });

  test('in a feed (XML), every element counts, and only "/>" closes one at once', () => {
    for (const xml of [`<rss><channel>${deep('x', 50_000)}</channel></rss>`, '<p>'.repeat(50_000), '<br>'.repeat(50_000)]) {
      expect(parserDepth(boundNesting(xml, { xml: true }), true)).toBeLessThanOrEqual(MAX_NESTING);
    }
  });

  test('measuring stays linear: 2 MB of hostile nesting is bounded in well under a second', () => {
    const markup = deep('span', 160_000);
    expect(markup.length).toBeGreaterThan(2_000_000);
    const start = performance.now();
    boundNesting(markup);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
