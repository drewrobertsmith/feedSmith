import { Readability } from '@mozilla/readability';
import { Effect, Option, Schema } from 'effect';
import { parseHTML } from 'linkedom';

import { htmlToBlocks, httpsUrl } from './blocks';
import type { FetchError } from './errors';
import { FeedHttp } from './http';
import { MAX_IMAGE_URL } from './parse';
import type { ExtractOutcome } from './validators';
import { boundNesting } from './nesting';

export type { ExtractOutcome };

/**
 * Less text than this isn't the Article: it's a teaser, a paywall's opening lines, or a page
 * that isn't an Article at all. The Reading view falls back to the Subtitle instead (Q6).
 */
export const MIN_ARTICLE_TEXT = 300;
/** JSON-LD is walked this deep, and no deeper, in hostile markup. */
const MAX_JSON_DEPTH = 8;

/** The page's own lead image (`og:image`, else `twitter:image`), https only (T18). */
function pageImage(document: Document, base: string): string | undefined {
  const content =
    document.querySelector('meta[property="og:image"]')?.getAttribute('content') ??
    document.querySelector('meta[name="twitter:image"]')?.getAttribute('content') ??
    undefined;
  const url = httpsUrl(content, base);
  return url && url.length <= MAX_IMAGE_URL ? url : undefined;
}

/** A JSON-LD script's text, decoded as JSON: untrusted, so anything else is no answer at all (FEE-112). */
const decodeJsonLd = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Json));

/** Whether a JSON-LD value says the content isn't free to read anywhere inside it, at most `MAX_JSON_DEPTH` deep. */
function saysPaywalled(value: Schema.Json, depth = 0): boolean {
  if (depth > MAX_JSON_DEPTH || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item: Schema.Json) => saysPaywalled(item, depth + 1));
  return Object.entries(value).some(
    ([key, inner]) =>
      (key === 'isAccessibleForFree' && (inner === false || String(inner).toLowerCase() === 'false')) ||
      saysPaywalled(inner, depth + 1),
  );
}

/** A page that declares, the way publishers do for search engines, that it's behind a paywall. */
function paywalled(document: Document): boolean {
  return [...document.querySelectorAll('script[type="application/ld+json"]')].some((script) =>
    Option.exists(decodeJsonLd(script.textContent ?? ''), (json) => saysPaywalled(json)),
  );
}

/**
 * The Article on a web page, for a Feed that carries only its summary (T8): Readability finds
 * the main content, and the Feed's own cleaner turns it into blocks, so a page's markup is held
 * to the same allowlist as a Feed's (T17, Q8). A page with no Article, too little text, or a
 * declared paywall fails, and so does anything that throws: nothing here throws.
 */
export function extractFromPage(html: string, url: string): ExtractOutcome {
  try {
    // Hostile nesting is cut first: linkedom's parser costs the square of the depth (FEE-57, Q8).
    const { document } = parseHTML(boundNesting(html));
    // The page's own image, when it has one, serves the Article either way (and the fallback, Q6).
    const imageUrl = pageImage(document, url);
    const image = imageUrl ? { imageUrl } : {};
    const failed: ExtractOutcome = { _tag: 'Failed', ...image };
    if (paywalled(document)) return failed;
    const found = new Readability(document).parse();
    if (!found?.content || (found.textContent ?? '').trim().length < MIN_ARTICLE_TEXT) return failed;
    const { blocks, omitted } = htmlToBlocks(found.content, url);
    if (!blocks.some((block) => block.type === 'paragraph')) return failed;
    return { _tag: 'Extracted', blocks, omitted, ...image };
  } catch {
    return { _tag: 'Failed' };
  }
}

/**
 * Reads an Article's page under the fetch policy (T18: https only, no private hosts, three
 * redirects, ten seconds, 2 MB) and extracts it. A page that can't be fetched fails with its
 * reason, typed; a page that's fetched but has no Article is a `Failed` outcome (FEE-110).
 */
export const fetchAndExtractEffect = Effect.fnUntraced(function* (link: string): Effect.fn.Return<ExtractOutcome, FetchError, FeedHttp> {
  const http = yield* FeedHttp;
  const response = yield* http.get(link);
  if (response._tag === 'NotModified') return { _tag: 'Failed' };
  return extractFromPage(response.body, response.url);
});
