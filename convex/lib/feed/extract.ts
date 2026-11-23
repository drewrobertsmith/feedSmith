import { Readability } from '@mozilla/readability';
import { Effect } from 'effect';
import { parseHTML } from 'linkedom';

import { htmlToBlocks, httpsUrl, type Block, type OmittedKind } from './blocks';
import { FeedHttp } from './http';
import { MAX_IMAGE_URL } from './parse';

/**
 * Less text than this isn't the Article: it's a teaser, a paywall's opening lines, or a page
 * that isn't an Article at all. The Reading view falls back to the Subtitle instead (Q6).
 */
export const MIN_ARTICLE_TEXT = 300;
/** JSON-LD is walked this deep, and no deeper, in hostile markup. */
const MAX_JSON_DEPTH = 8;

export type ExtractOutcome =
  | { _tag: 'Extracted'; blocks: Block[]; omitted: OmittedKind[]; imageUrl?: string }
  /** The page's own image, when it has one, still serves the fallback. */
  | { _tag: 'Failed'; imageUrl?: string };

/** The page's own lead image (`og:image`, else `twitter:image`), https only (T18). */
function pageImage(document: Document, base: string): string | undefined {
  const content =
    document.querySelector('meta[property="og:image"]')?.getAttribute('content') ??
    document.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ??
    undefined;
  const url = httpsUrl(content, base);
  return url && url.length <= MAX_IMAGE_URL ? url : undefined;
}

/** Whether a JSON-LD value says the content isn't free to read anywhere inside it. */
function saysPaywalled(value: unknown, depth = 0): boolean {
  if (depth > MAX_JSON_DEPTH || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => saysPaywalled(item, depth + 1));
  for (const [key, inner] of Object.entries(value)) {
    if (key === 'isAccessibleForFree' && (inner === false || String(inner).toLowerCase() === 'false')) return true;
    if (saysPaywalled(inner, depth + 1)) return true;
  }
  return false;
}

/** A page that declares, the way publishers do for search engines, that it's behind a paywall. */
function paywalled(document: Document): boolean {
  return [...document.querySelectorAll('script[type="application/ld+json"]')].some((script) => {
    try {
      return saysPaywalled(JSON.parse(script.textContent ?? ''));
    } catch {
      return false;
    }
  });
}

/**
 * The Article on a web page, for a Feed that carries only its summary (T8): Readability finds
 * the main content, and the Feed's own cleaner turns it into blocks, so a page's markup is held
 * to the same allowlist as a Feed's (T17, Q8). A page with no Article, too little text, or a
 * declared paywall fails, and so does anything that throws: nothing here throws.
 */
export function extractFromPage(html: string, url: string): ExtractOutcome {
  try {
    const { document } = parseHTML(html);
    const imageUrl = pageImage(document, url);
    const failed: ExtractOutcome = imageUrl ? { _tag: 'Failed', imageUrl } : { _tag: 'Failed' };
    if (paywalled(document)) return failed;
    const found = new Readability(document).parse();
    if (!found?.content || (found.textContent ?? '').trim().length < MIN_ARTICLE_TEXT) return failed;
    const { blocks, omitted } = htmlToBlocks(found.content, url);
    if (!blocks.some((block) => block.type === 'paragraph')) return failed;
    return imageUrl ? { _tag: 'Extracted', blocks, omitted, imageUrl } : { _tag: 'Extracted', blocks, omitted };
  } catch {
    return { _tag: 'Failed' };
  }
}

/**
 * Reads an Article's page under the fetch policy (T18: https only, no private hosts, three
 * redirects, ten seconds, 2 MB) and extracts it. A page that can't be fetched fails like one
 * with no Article on it: nothing here throws.
 */
export function fetchAndExtract(link: string): Promise<ExtractOutcome> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const http = yield* FeedHttp;
      const response = yield* http.get(link);
      if (response._tag === 'NotModified') return { _tag: 'Failed' as const };
      return extractFromPage(response.body, response.url);
    }).pipe(
      Effect.provide(FeedHttp.layer),
      Effect.catch(() => Effect.succeed({ _tag: 'Failed' as const })),
    ),
  );
}
