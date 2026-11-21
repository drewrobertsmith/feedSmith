import { describe, expect, test } from 'vitest';

import type { ParsedArticle } from './parse';
import { articlesToStore } from './store';

const article = (i: number, html?: string): ParsedArticle => ({
  guid: `g${i}`,
  title: `A${i}`,
  subtitle: `Sub ${i}`,
  publishedAt: 1000 - i,
  html,
});

describe('what one fetch stores', () => {
  test('newest Articles keep their bodies; older ones past the budget keep only their Subtitle', () => {
    const body = `<p>${'word '.repeat(200)}</p>`;
    const stored = articlesToStore([article(0, body), article(1, body), article(2, body)], 2500);
    expect(stored.map((a) => a.blocks[0].type === 'paragraph' && a.blocks[0].spans[0].text.length > 100)).toEqual([
      true,
      true,
      false,
    ]);
    expect(stored[2].blocks).toEqual([{ type: 'paragraph', spans: [{ text: 'Sub 2' }] }]);
  });

  test('each guid once', () => {
    expect(articlesToStore([article(0), article(0), article(1)]).map((a) => a.guid)).toEqual(['g0', 'g1']);
  });

  test('an Article without full text keeps its Subtitle; the raw HTML is never stored', () => {
    const [stored] = articlesToStore([article(0)]);
    expect(stored.blocks).toEqual([{ type: 'paragraph', spans: [{ text: 'Sub 0' }] }]);
    expect('html' in stored).toBe(false);
  });
});
