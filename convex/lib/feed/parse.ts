import { isTag, type Element } from 'domhandler';
import { Effect } from 'effect';
import { DomUtils, parseDocument } from 'htmlparser2';

import { httpsUrl, NO_BASE } from './blocks';
import { NotAFeed } from './errors';
import { boundNesting } from './nesting';

/** A fetch keeps a Feed's newest Articles, up to this many (T18). */
export const MAX_ARTICLES = 100;
const MAX_FEED_TITLE = 200;
const MAX_TITLE = 300;
const MAX_SUBTITLE = 500;
const MAX_GUID = 500;
export const MAX_IMAGE_URL = 2048;
/** An Article credits at most this many authors, each at most this long (FEE-41). */
const MAX_AUTHORS = 10;
const MAX_AUTHOR = 100;
const EMAIL = /\S+@\S+/g;

export type ParsedArticle = {
  guid: string;
  title: string;
  link?: string;
  subtitle?: string;
  publishedAt: number;
  /** The Article's own lead image, from its media or enclosure tags (https only). */
  imageUrl?: string;
  /** The Feed's full text for the Article, still HTML; `htmlToBlocks` cleans it. */
  html?: string;
  /** Who wrote it, by name only: an email address is never kept (FEE-41). */
  authors?: string[];
};

export type ParsedFeed = {
  title: string;
  /** The site's origin, from the Feed's own link; never the feed URL, which is a secret (T9). */
  siteUrl?: string;
  articles: ParsedArticle[];
};

/** An https image URL of sensible length, or undefined. */
function imageUrl(value: string | undefined, base: string): string | undefined {
  const url = httpsUrl(value, base);
  return url && url.length <= MAX_IMAGE_URL ? url : undefined;
}

/** The origin of an https site link, or undefined. */
function siteOrigin(value: string | undefined): string | undefined {
  const url = httpsUrl(value, NO_BASE);
  return url && !url.startsWith(NO_BASE) ? new URL(url).origin : undefined;
}

const isImage = (el: Element) => (el.attribs.medium ?? '') === 'image' || (el.attribs.type ?? '').startsWith('image/');

/** An Article's own lead image: media:content, media:thumbnail, or an image enclosure. */
function leadImage(entry: Element, base: string): string | undefined {
  const candidates = [
    ...children(entry, 'media:content').filter(isImage).map((el) => el.attribs.url),
    ...children(entry, 'media:thumbnail').map((el) => el.attribs.url),
    ...children(entry, 'enclosure').filter(isImage).map((el) => el.attribs.url),
    ...children(entry, 'link')
      .filter((el) => el.attribs.rel === 'enclosure' && isImage(el))
      .map((el) => el.attribs.href),
  ];
  for (const candidate of candidates) {
    const url = imageUrl(candidate, base);
    if (url) return url;
  }
  return undefined;
}

const clip = (text: string, max: number) => text.slice(0, max);
const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The text of an element, read as plain text. */
function text(el: Element | null | undefined): string {
  return el ? squash(DomUtils.textContent(el)) : '';
}

/** HTML (escaped inside the XML) read as plain text. */
function plain(html: string): string {
  return squash(DomUtils.textContent(parseDocument(boundNesting(html), { decodeEntities: true })));
}

function child(el: Element, name: string): Element | undefined {
  return el.children.find((c): c is Element => isTag(c) && c.name.toLowerCase() === name);
}

function children(el: Element, name: string): Element[] {
  return el.children.filter((c): c is Element => isTag(c) && c.name.toLowerCase() === name);
}

/**
 * A name with any email address taken out: `jane@example.com (Jane Doe)` and
 * `Jane Doe (jane@example.com)` both give "Jane Doe"; brackets that aren't around an email,
 * like "Jane Doe (Editor)", stay as written.
 */
function withoutEmail(text: string): string {
  if (!text.match(EMAIL)) return text;
  const rest = squash(text.replace(EMAIL, '').replace(/\(\s*\)/g, ''));
  const bracketed = rest.match(/^\((.*)\)$/);
  // What separated the name from its email ("Jane Doe, jane@…") goes with it.
  return squash(bracketed ? bracketed[1] : rest).replace(/^[\s,;:<>-]+|[\s,;:<>-]+$/g, '');
}

/**
 * Authors by name, as plain text: emails are removed (RSS `<author>` is often
 * `jane@example.com (Jane Doe)`, which keeps "Jane Doe"), duplicates dropped, and both the
 * count and each name capped. Undefined when nobody is credited.
 */
function authorNames(values: string[]): string[] | undefined {
  const names = new Set<string>();
  for (const value of values) {
    const name = withoutEmail(squash(plain(value)));
    if (name) names.add(clip(name, MAX_AUTHOR));
    if (names.size >= MAX_AUTHORS) break;
  }
  return names.size > 0 ? [...names] : undefined;
}

function date(value: string, now: number): number {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : now;
}

function article(fields: Omit<ParsedArticle, 'guid'> & { guid: string }): ParsedArticle | undefined {
  const guid = clip(fields.guid || fields.link || '', MAX_GUID);
  if (!guid || !fields.title) return undefined;
  const out: ParsedArticle = { guid, title: clip(fields.title, MAX_TITLE), publishedAt: fields.publishedAt };
  if (fields.link) out.link = fields.link;
  if (fields.subtitle) out.subtitle = clip(fields.subtitle, MAX_SUBTITLE);
  if (fields.imageUrl) out.imageUrl = fields.imageUrl;
  if (fields.html) out.html = fields.html;
  if (fields.authors) out.authors = fields.authors;
  return out;
}

function rssArticle(item: Element, base: string, now: number): ParsedArticle | undefined {
  const link = httpsUrl(text(child(item, 'link')), base);
  const description = DomUtils.textContent(child(item, 'description') ?? item).trim();
  return article({
    guid: text(child(item, 'guid')),
    title: plain(text(child(item, 'title'))),
    link,
    subtitle: child(item, 'description') ? plain(description) : undefined,
    publishedAt: date(text(child(item, 'pubdate') ?? child(item, 'dc:date')), now),
    imageUrl: leadImage(item, base),
    html: child(item, 'content:encoded') ? DomUtils.textContent(child(item, 'content:encoded')!) : undefined,
    authors: authorNames([...children(item, 'dc:creator'), ...children(item, 'author')].map((el) => DomUtils.textContent(el))),
  });
}

/** Atom text constructs: `type="html"` holds escaped HTML, `xhtml` holds markup. */
function atomText(el: Element | undefined): string {
  if (!el) return '';
  const type = el.attribs.type;
  if (type === 'xhtml') return plain(DomUtils.getInnerHTML(el, { xmlMode: true }));
  if (type === 'html') return plain(DomUtils.textContent(el));
  return text(el);
}

function atomHtml(el: Element | undefined): string | undefined {
  if (!el) return undefined;
  const type = el.attribs.type;
  if (type === 'xhtml') {
    const div = child(el, 'div');
    return DomUtils.getInnerHTML(div ?? el, { xmlMode: true });
  }
  if (type === 'html') return DomUtils.textContent(el);
  // Plain text content: escape it into a paragraph's worth of HTML.
  const raw = DomUtils.textContent(el);
  return raw ? `<p>${raw.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>` : undefined;
}

function atomArticle(entry: Element, base: string, now: number): ParsedArticle | undefined {
  const links = children(entry, 'link');
  const alternate = links.find((l) => !l.attribs.rel || l.attribs.rel === 'alternate');
  return article({
    guid: text(child(entry, 'id')),
    title: atomText(child(entry, 'title')),
    link: httpsUrl(alternate?.attribs.href, base),
    subtitle: atomText(child(entry, 'summary')) || undefined,
    publishedAt: date(text(child(entry, 'published') ?? child(entry, 'updated')), now),
    imageUrl: leadImage(entry, base),
    html: atomHtml(child(entry, 'content')),
    authors: authorNames(children(entry, 'author').map((el) => DomUtils.textContent(child(el, 'name') ?? []))),
  });
}

/**
 * Reads an RSS 2.0 or Atom document into a Feed and its newest Articles. Custom DOCTYPE
 * entities are never expanded, and every field is capped. `now` dates undated Articles.
 */
export const parseFeed = Effect.fnUntraced(function* (xml: string, now: number) {
  // Hostile nesting is cut before parsing, which costs the square of the depth (FEE-57, Q8).
  const document = parseDocument(boundNesting(xml, { xml: true }), { xmlMode: true, decodeEntities: true });
  const root = document.children.find(isTag);
  const name = root?.name.toLowerCase();

  let feed: ParsedFeed;
  if (root && name === 'rss') {
    const channel = child(root, 'channel');
    if (!channel) return yield* new NotAFeed();
    const base = httpsUrl(text(child(channel, 'link')), NO_BASE) ?? NO_BASE;
    feed = {
      title: clip(plain(text(child(channel, 'title'))), MAX_FEED_TITLE),
      siteUrl: siteOrigin(text(child(channel, 'link'))),
      articles: children(channel, 'item').flatMap((item) => rssArticle(item, base, now) ?? []),
    };
  } else if (root && name === 'feed') {
    const self = children(root, 'link').find((l) => !l.attribs.rel || l.attribs.rel === 'alternate');
    const base = httpsUrl(self?.attribs.href, NO_BASE) ?? NO_BASE;
    feed = {
      title: clip(atomText(child(root, 'title')), MAX_FEED_TITLE),
      siteUrl: siteOrigin(self?.attribs.href),
      articles: children(root, 'entry').flatMap((entry) => atomArticle(entry, base, now) ?? []),
    };
  } else {
    return yield* new NotAFeed();
  }

  feed.articles.sort((a, b) => b.publishedAt - a.publishedAt);
  feed.articles = feed.articles.slice(0, MAX_ARTICLES);
  return feed;
});
