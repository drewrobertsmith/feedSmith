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

export type FeedLink = { url: string; title: string };
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
  const found = new Map<string, FeedLink>();
  for (const link of heads(html).links) {
    if (found.size >= MAX_FEED_LINKS) break;
    if (!rels(link).has('alternate') || !FEED_TYPES.has((link.attribs.type ?? '').toLowerCase())) continue;
    const url = safeUrl(link.attribs.href ?? '', pageUrl);
    if (!url || url.href.length > MAX_FEED_URL || found.has(url.href)) continue;
    const title = plain(link.attribs.title, MAX_TITLE) ?? `${url.host}${url.pathname}`.slice(0, MAX_TITLE);
    found.set(url.href, { url: url.href, title });
  }
  return [...found.values()];
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
