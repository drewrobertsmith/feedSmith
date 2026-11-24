import { findFeedLinks, siteMeta } from './discover';
import { siteHost } from './face';
import { fetchFeed, type FetchOutcome } from './fetch';
import { COMMON_PATHS, looksParked, nameMatch } from './find';

/** A Feed proven for a typed name: a real site of that name, with a feed that parses (FEE-80). */
export type Proven = {
  url: string;
  name: string;
  /** The site's host as shown, without `www.`. */
  host: string;
  siteUrl: string;
  iconUrl?: string;
  source: 'declared' | 'common-path';
};

/** A homepage declaring several feeds is proven by its first that parses, trying this many. */
const DECLARED_TRIES = 3;

/**
 * A search's fetch budget: at most `fetches` fetches, and none started after `deadline`. Every
 * fetch goes through `fetchFeed`, so each keeps the fetch policy (T18): https, 10 seconds, 2 MB,
 * three redirects, no private addresses.
 */
export class Budget {
  #left: number;
  readonly #deadline: number;

  constructor(fetches: number, deadline: number) {
    this.#left = fetches;
    this.#deadline = deadline;
  }

  fetch(url: string): Promise<FetchOutcome> {
    if (this.#left <= 0 || Date.now() >= this.#deadline) return Promise.resolve({ _tag: 'Failed', reason: 'timeout' });
    this.#left--;
    return fetchFeed(url);
  }
}

/**
 * Proves a guessed host for a typed name, or null: its homepage answers (after redirects, and not
 * at a site already tried in this search), isn't parked, names itself like what was typed, and
 * has a feed that parses, declared by the page or else at a common address.
 */
export async function proveSite(host: string, typed: string, budget: Budget, tried: Set<string>): Promise<Proven | null> {
  const page = await budget.fetch(`https://${host}/`);
  if (page._tag !== 'Page') return null;
  const site = new URL(page.url);
  const shown = siteHost(site.href);
  // Candidates that land on one site collapse into one.
  if (tried.has(shown)) return null;
  tried.add(shown);

  const links = findFeedLinks(page.body, page.url);
  if (looksParked(page.body, page.url, links.length > 0)) return null;
  const meta = siteMeta(page.body, page.url);
  if (!meta.name || nameMatch(typed, meta.name) === 0) return null;

  const tries =
    links.length > 0
      ? links.slice(0, DECLARED_TRIES).map((link) => ({ url: link.url, source: 'declared' as const }))
      : COMMON_PATHS.map((path) => ({ url: new URL(path, site.origin).href, source: 'common-path' as const }));
  for (const attempt of tries) {
    const outcome = await budget.fetch(attempt.url);
    if (outcome._tag !== 'Fetched') continue;
    const proven: Proven = { url: attempt.url, name: meta.name, host: shown, siteUrl: site.origin, source: attempt.source };
    if (meta.iconUrl) proven.iconUrl = meta.iconUrl;
    return proven;
  }
  return null;
}
