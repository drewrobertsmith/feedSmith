import { parse } from 'tldts';

/**
 * Finding a Feed by its site's name (FEE-80, D32): which addresses to guess, whether a site's own
 * name matches what was typed, whether a page is a parked domain, and how results rank. Pure: no
 * fetching happens here.
 */

/** A name longer than this isn't one: it's refused whole, never cut down and guessed at. */
export const MAX_NAME = 100;
/** A site's name of more words than this isn't searched for. */
const MAX_WORDS = 6;
/** One search guesses at most this many addresses. */
export const MAX_CANDIDATES = 16;

const ENDINGS = ['com', 'net', 'org', 'blog', 'io', 'co', 'dev'];
/** Hosted-blog platforms, whose sites live at `name.<platform>` and have predictable feeds. */
const PLATFORMS = ['substack.com', 'wordpress.com', 'blogspot.com', 'ghost.io', 'tumblr.com', 'micro.blog', 'bearblog.dev'];
const PLATFORM_LABELS = new Set(['substack', 'wordpress', 'blogspot', 'ghost', 'tumblr', 'micro', 'bearblog']);
/** Words that are never a name on their own. */
const FILLER = new Set(['the', 'a', 'an']);
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Where a site's feed usually is, when its homepage doesn't say (tried in this order). */
export const COMMON_PATHS = ['/feed', '/rss', '/feed.xml', '/rss.xml', '/atom.xml', '/index.xml', '/feeds/posts/default'];

/** Lower case, accents gone, split on anything but ASCII letters and digits. */
function words(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** The squashed spellings of a run of words: with a leading "the" and without ("theverge", "verge"). */
function keys(list: string[]): string[] {
  const all = list.join('');
  const content = list[0] === 'the' && list.length > 1 ? list.slice(1).join('') : all;
  return all === content ? [all] : [all, content];
}

/** Words without a leading "the": "The Verge" and "Verge" are the same words. */
const content = (list: string[]) => (list[0] === 'the' && list.length > 1 ? list.slice(1) : list);

/** A typed name's words, or null when it isn't a name worth searching for. */
export function nameWords(name: string): string[] | null {
  if (name.length > MAX_NAME) return null;
  const list = words(name);
  if (list.length === 0 || list.length > MAX_WORDS || list.every((word) => FILLER.has(word))) return null;
  return list;
}

/** The words the search index is asked for: the name's own, never more than the cap. */
export function searchTerms(name: string): string | null {
  return nameWords(name)?.join(' ') ?? null;
}

/** A host that names a real registrable site under the Public Suffix List, and nothing else. */
function validHost(host: string): boolean {
  const result = parse(host, { allowPrivateDomains: true });
  return result.hostname === host && !result.isIp && result.domain !== null && result.publicSuffix !== null && (result.isIcann === true || result.isPrivate === true);
}

/**
 * The addresses to guess for a name, in a fixed order: the squashed name on the likely endings,
 * its other spellings on `.com`, then the hosted-blog platforms. Every one is a valid host under
 * the Public Suffix List; a name that isn't one gives none.
 */
export function candidates(name: string): string[] {
  const list = nameWords(name);
  if (!list) return [];
  const [joined, ...others] = keys(list);
  const spellings = list.length > 1 ? [...others, list.join('-')] : others;
  const hosts = [
    ...ENDINGS.slice(0, 3).map((end) => `${joined}.${end}`),
    ...spellings.map((label) => `${label}.com`),
    ...ENDINGS.slice(3).map((end) => `${joined}.${end}`),
    ...PLATFORMS.map((platform) => `${joined}.${platform}`),
  ];
  const valid = hosts.filter((host) => LABEL.test(host.split('.')[0]) && validHost(host));
  return [...new Set(valid)].slice(0, MAX_CANDIDATES);
}

/** The edit distance between two short strings (both are capped well under 100 characters). */
function distance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

/** A site's name as written, and its part before a tagline ("Blog – Notes on things" → "Blog"). */
function nameForms(site: string): string[] {
  const head = site.split(/\s[-|–—:·]\s|:\s/)[0];
  return head && head !== site ? [site, head] : [site];
}

function matchOne(typed: string[], site: string[]): 0 | 1 | 2 | 3 {
  if (site.length === 0) return 0;
  const typedKeys = keys(typed);
  const siteKeys = keys(site);
  if (typedKeys.some((key) => siteKeys.includes(key))) return 3;
  const [small, big] = [content(typed), content(site)].sort((x, y) => x.length - y.length);
  if (big.length - small.length <= 1 && small.every((word) => big.includes(word))) return 2;
  const [a, b] = [typedKeys.at(-1)!, siteKeys.at(-1)!];
  if (a.length >= 4 && distance(a, b) <= (a.length >= 10 ? 2 : 1)) return 1;
  return 0;
}

/**
 * How well a site's own name matches what was typed: 3, the same name ("the verge" and "The
 * Verge", or "theverge"); 2, the same words give or take one ("verge" and "The Verge"); 1, a small
 * typo ("daring fireba11"); 0, not this site.
 */
export function nameMatch(typed: string, site: string): 0 | 1 | 2 | 3 {
  const list = nameWords(typed);
  if (!list) return 0;
  return Math.max(...nameForms(site).map((form) => matchOne(list, words(form)))) as 0 | 1 | 2 | 3;
}

/** The label that names a site in its host: `theverge` in `www.theverge.com`, `daring` in `daring.substack.com`. */
export function siteLabel(host: string): string {
  const result = parse(host, { allowPrivateDomains: true });
  const label = result.domainWithoutSuffix ?? host.split('.')[0];
  if (PLATFORM_LABELS.has(label) && result.subdomain) return result.subdomain.split('.').at(-1)!;
  return label;
}

/** Whether a site's host is the typed name squashed: `theverge.com` for "the verge". */
export function hostMatch(typed: string, host: string): boolean {
  const list = nameWords(typed);
  if (!list) return false;
  const label = siteLabel(host).replace(/-/g, '');
  return keys(list).includes(label);
}

/** The same name, on the site whose host is that name: guessing stops here. */
export function isStrong(typed: string, found: { name: string; host: string }): boolean {
  return nameMatch(typed, found.name) === 3 && hostMatch(typed, found.host);
}

/** Domain parking and sale services: a page served from one of these is never a site. */
const PARKING_HOSTS = [
  'sedoparking.com',
  'sedo.com',
  'parkingcrew.net',
  'bodis.com',
  'dan.com',
  'afternic.com',
  'hugedomains.com',
  'above.com',
  'sav.com',
  'undeveloped.com',
  'parklogic.com',
  'buydomains.com',
  'domainmarket.com',
  'atom.com',
  'squadhelp.com',
];
const PARKED_WORDS =
  /\b(?:domain (?:name )?(?:is|may be) for sale|buy this domain|this domain is parked|domain parking|parked (?:free|domain)|(?:is|are) available for purchase|this domain has expired|related searches)\b/i;
/** Only the start of a page is read for its words. */
const READ = 64 * 1024;
/** A page with less visible text than this, and no feed of its own, is nothing. */
const NEAR_EMPTY = 40;

/**
 * Whether a page is a parked or for-sale domain rather than a site: served from a parking service,
 * saying it's for sale, or near-empty with no feed of its own.
 */
export function looksParked(html: string, pageUrl: string, declaresFeeds: boolean): boolean {
  const host = new URL(pageUrl).hostname;
  if (PARKING_HOSTS.some((parker) => host === parker || host.endsWith(`.${parker}`))) return true;
  const text = visibleText(html.slice(0, READ));
  if (PARKED_WORDS.test(text)) return true;
  return !declaresFeeds && text.length < NEAR_EMPTY;
}

/**
 * The words a page shows: tags dropped, and script and style with their contents. One pass
 * forward, so hostile markup (thousands of unclosed tags) costs linear time, never quadratic.
 */
function visibleText(html: string): string {
  const lower = html.toLowerCase();
  const parts: string[] = [];
  let at = 0;
  while (at < html.length) {
    const open = lower.indexOf('<', at);
    if (open < 0) {
      parts.push(html.slice(at));
      break;
    }
    parts.push(html.slice(at, open));
    const close = lower.indexOf('>', open);
    if (close < 0) break;
    at = close + 1;
    const raw = /^<(script|style)\b/.exec(lower.slice(open, open + 7))?.[1];
    if (raw) {
      const end = lower.indexOf(`</${raw}`, at);
      if (end < 0) break;
      const endClose = lower.indexOf('>', end);
      if (endClose < 0) break;
      at = endClose + 1;
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export type Ranked = { name: string; host: string; source: 'declared' | 'common-path'; finds: number };

/**
 * Results in order: the strength of the name match, then the site whose host is the name, then
 * known Feeds (found more often) over new ones, then declared feeds over guessed paths, then a
 * `.com` or shorter address.
 */
export function rank<T extends Ranked>(typed: string, found: T[]): T[] {
  const scored = found.map((entry) => ({
    entry,
    key: [
      -nameMatch(typed, entry.name),
      hostMatch(typed, entry.host) ? 0 : 1,
      -entry.finds,
      entry.source === 'declared' ? 0 : 1,
      entry.host.endsWith('.com') ? 0 : 1,
      entry.host.length,
    ],
  }));
  scored.sort((x, y) => {
    for (let i = 0; i < x.key.length; i++) if (x.key[i] !== y.key[i]) return x.key[i] - y.key[i];
    return x.entry.host.localeCompare(y.entry.host);
  });
  return scored.map(({ entry }) => entry);
}
