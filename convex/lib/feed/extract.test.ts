/// <reference types="vite/client" />
import { describe, expect, test } from 'vitest';

import type { Block } from './blocks';
import { extractFromPage } from './extract';
import article from './fixtures/page-article.html?raw';
import index from './fixtures/page-index.html?raw';
import paywall from './fixtures/page-paywall.html?raw';

const URL = 'https://calmnotes.example/2026/slow-reading';

/** Every span's text, every image's src, and every link, as one searchable string. */
function flatten(blocks: Block[]) {
  return JSON.stringify(blocks);
}

describe('extracting an Article from its page (FEE-25, T8)', () => {
  test("an Article page gives its text, in the Feed's own block format", () => {
    const result = extractFromPage(article, URL);
    expect(result._tag).toBe('Extracted');
    if (result._tag !== 'Extracted') return;
    const text = flatten(result.blocks);
    expect(text).toContain('Slow reading is a practice, not a speed.');
    expect(result.blocks).toContainEqual({ type: 'heading', spans: [{ text: 'Why it matters' }] });
    expect(result.blocks).toContainEqual(expect.objectContaining({ type: 'image', src: 'https://calmnotes.example/img/desk.jpg' }));
    expect(text).toContain('https://calmnotes.example/notes');
  });

  test("only the Article: never the page's navigation, sidebar or footer", () => {
    const result = extractFromPage(article, URL);
    if (result._tag !== 'Extracted') throw new Error('expected an Article');
    const text = flatten(result.blocks);
    expect(text).not.toMatch(/Archive|Related|© Calm Notes/);
  });

  test("a page's scripts, frames, handlers, javascript: links and tracking pixels never get through (Q8)", () => {
    const result = extractFromPage(article, URL);
    if (result._tag !== 'Extracted') throw new Error('expected an Article');
    const text = flatten(result.blocks);
    expect(text).not.toMatch(/track\(|tracker\.example|javascript:|alert|evil\.example|onclick|onerror/);
  });

  test("the page's own image becomes the lead image", () => {
    expect(extractFromPage(article, URL)).toMatchObject({ imageUrl: 'https://calmnotes.example/img/slow-reading.jpg' });
  });

  test('a page with no Article on it fails, so the Reading view falls back (Q6)', () => {
    expect(extractFromPage(index, 'https://calmnotes.example/')).toEqual({ _tag: 'Failed' });
  });

  test('a page behind a paywall fails rather than storing its teaser, and keeps its image for the fallback', () => {
    expect(extractFromPage(paywall, 'https://daily.example/long-game')).toEqual({
      _tag: 'Failed',
      imageUrl: 'https://daily.example/img/long-game.jpg',
    });
  });

  test("markup that isn't a page at all fails quietly, never throws", () => {
    expect(extractFromPage('', URL)).toEqual({ _tag: 'Failed' });
    expect(extractFromPage('<<<<>>>>\u0000', URL)).toEqual({ _tag: 'Failed' });
  });

  test('a lead image must be https, like every other image (T18)', () => {
    const page = article.replace('https://calmnotes.example/img/slow-reading.jpg', 'http://calmnotes.example/x.jpg');
    expect(extractFromPage(page, URL)).not.toHaveProperty('imageUrl');
  });
});
