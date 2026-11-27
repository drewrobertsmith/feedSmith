import { isTag, type ChildNode, type Element } from 'domhandler';
import { parseDocument } from 'htmlparser2';

import { safeUrl } from './http';
import { nameFromTitle } from './name';

/** A page offers at most this many feeds to choose from (T21). */
export const MAX_FEED_LINKS = 10;
const MAX_TITLE = 100;
const MAX_ICON_URL = 2048;
/** A Feed address longer than this isn't one (the same cap as a typed URL). */
const MAX_FEED_URL = 2048;
/** Only the head is read, and never more than this of the page. */
const MAX_HEAD = 256 * 1024;
/** The head is where these live; the walk stops this deep in hostile markup. */
const MAX_DEPTH = 32;

const FEED_TYPES = new Set(['application/rss+xml', 'application/atom+xml']);

/**
 * A feed a page advertises. `twins`: the same feed's addresses in other formats (FEE-133), so following any of them
 * counts as following it (T22).
 */
export type FeedLink = { url: string; title: string; twins?: string[] };
/**
 * What a site says about itself (T21). `pageTitle` is set only when the name came from the page's <title>: the
 * whole title, as feedSmith named Feeds by it before FEE-89, so a Feed named that way can be recognised.
 */
export type SiteMeta = { name?: string; iconUrl?: string; pageTitle?: string };

const plain = (value: string | undefined, max: number) => {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : undefined;
};

/** Every <link> and <meta> element in the page, depth-limited, plus the <title>'s text. */
function heads(html: string) {
  const links: Element[] = [];
  const metas: Element[] = [];
  let title: string | undefined;
  const walk = (nodes: ChildNode[], depth: number) => {
    if (depth > MAX_DEPTH) return;
    for (const node of nodes) {
      if (!isTag(node)) continue;
      const name = node.name.toLowerCase();
      if (name === 'link') links.push(node);
      else if (name === 'meta') metas.push(node);
      else if (name === 'title' && title === undefined)
        title = node.children.map((child) => ('data' in child ? String(child.data) : '')).join('');
      else if (name !== 'body') walk(node.children, depth + 1);
    }
  };
  // Only the head matters: cut the page at <body> (and at MAX_HEAD) before building a tree.
  const bodyAt = html.search(/<body[\s>]/i);
  const head = html.slice(0, Math.min(bodyAt >= 0 ? bodyAt : html.length, MAX_HEAD));
  walk(parseDocument(head, { decodeEntities: true }).children, 0);
  return { links, metas, title };
}

const rels = (el: Element) => new Set((el.attribs.rel ?? '').toLowerCase().split(/\s+/));

/**
 * The feeds a page advertises with <link rel="alternate">, resolved against the page and
 * checked against the fetch policy (T18): https, a domain-name host, no credentials.
 */
export function findFeedLinks(html: string, pageUrl: string): FeedLink[] {
  const found = new Map<string, FeedLink & { atom: boolean; folder: string }>();
  for (const link of heads(html).links) {
    if (found.size >= MAX_FEED_LINKS) break;
    const type = (link.attribs.type ?? '').toLowerCase();
    if (!rels(link).has('alternate') || !FEED_TYPES.has(type)) continue;
    const url = safeUrl(link.attribs.href ?? '', pageUrl);
    if (!url || url.href.length > MAX_FEED_URL || found.has(url.href)) continue;
    const title = plain(link.attribs.title, MAX_TITLE) ?? `${url.host}${url.pathname}`.slice(0, MAX_TITLE);
    const slash = url.pathname.lastIndexOf('/') + 1;
    const name = url.pathname.slice(slash).replace(/\.[a-z0-9]+$/i, '').toLowerCase();
    // Only a feed named for its format can have a twin in another format; "reviews.atom" is a feed of its own.
    const folder = GENERIC_NAMES.has(name) ? `${url.host}${url.pathname.slice(0, slash)}` : url.href;
    found.set(url.href, { url: url.href, title, atom: type === ATOM, folder });
  }
  return oneFeedPerFormatPair([...found.values()]).map(({ url, title, twins }) => (twins ? { url, title, twins } : { url, title }));
}

const ATOM = 'application/atom+xml';
/** File names that say only "this is the feed", in some format: `rss.xml`, `atom.xml`, `feed.xml`, `index.xml`. */
const GENERIC_NAMES = new Set(['rss', 'rss2', 'atom', 'feed', 'index']);

/**
 * One feed offered as both RSS and Atom, in one folder of one site and named only for its format (`/blog/rss.xml`,
 * `/blog/atom.xml`), is one feed,
 * not a choice (FEE-133): the Atom one is kept, since Atom requires an id, a date and an author on every entry, with
 * the RSS address as its twin. A folder holding anything else (two of one format, say) is left as it is.
 */
function oneFeedPerFormatPair<T extends FeedLink & { atom: boolean; folder: string }>(links: T[]): T[] {
  const inFolder = new Map<string, T[]>();
  for (const link of links) inFolder.set(link.folder, [...(inFolder.get(link.folder) ?? []), link]);
  const dropped = new Set<string>();
  const kept = new Map<string, T>();
  for (const pair of inFolder.values()) {
    const atom = pair.filter((link) => link.atom);
    if (pair.length !== 2 || atom.length !== 1) continue;
    const rss = pair.find((link) => !link.atom)!;
    dropped.add(rss.url);
    kept.set(atom[0].url, { ...atom[0], twins: [rss.url] });
  }
  return links.filter((link) => !dropped.has(link.url)).map((link) => kept.get(link.url) ?? link);
}

/** What a site says about itself: its name and its icon (T21). */
export function siteMeta(html: string, pageUrl: string): SiteMeta {
  const { links, metas, title } = heads(html);
  const meta = (key: string, value: string) =>
    metas.find((m) => (m.attribs[key] ?? '').toLowerCase() === value)?.attribs.content;
  const stated = plain(meta('property', 'og:site_name'), MAX_TITLE) ?? plain(meta('name', 'application-name'), MAX_TITLE);
  // A name the site states is kept as it is; one from its <title> keeps the part before the tagline (FEE-89).
  const whole = stated ? undefined : plain(title, Infinity);
  const name = stated ?? (whole ? nameFromTitle(whole).slice(0, MAX_TITLE) : undefined);

  const iconHref =
    links.find((l) => rels(l).has('apple-touch-icon'))?.attribs.href ??
    links.find((l) => rels(l).has('icon'))?.attribs.href;
  // The phone loads the icon, so it meets the fetch policy too (T18): no local or IP hosts.
  const icon = iconHref ? safeUrl(iconHref, pageUrl) : null;
  const iconUrl = icon && icon.href.length <= MAX_ICON_URL ? icon.href : undefined;

  const out: SiteMeta = {};
  if (name) out.name = name;
  if (whole) out.pageTitle = whole.slice(0, MAX_TITLE);
  if (iconUrl) out.iconUrl = iconUrl;
  return out;
}
