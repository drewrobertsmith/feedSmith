import { isTag, type Element } from 'domhandler';
import { Effect } from 'effect';
import { DomUtils, parseDocument } from 'htmlparser2';

import { httpsUrl, NO_BASE } from './blocks';
import { NotAFeed } from './errors';

/** A fetch keeps a Feed's newest Articles, up to this many (T18). */
export const MAX_ARTICLES = 100;
const MAX_FEED_TITLE = 200;
const MAX_TITLE = 300;
const MAX_SUBTITLE = 500;
const MAX_GUID = 500;

export type ParsedArticle = {
  guid: string;
  title: string;
  link?: string;
  subtitle?: string;
  publishedAt: number;
  /** The Feed's full text for the Article, still HTML; `htmlToBlocks` cleans it. */
  html?: string;
};

export type ParsedFeed = { title: string; articles: ParsedArticle[] };

const clip = (text: string, max: number) => text.slice(0, max);
const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The text of an element, read as plain text. */
function text(el: Element | null | undefined): string {
  return el ? squash(DomUtils.textContent(el)) : '';
}

/** HTML (escaped inside the XML) read as plain text. */
function plain(html: string): string {
  return squash(DomUtils.textContent(parseDocument(html, { decodeEntities: true })));
}

function child(el: Element, name: string): Element | undefined {
  return el.children.find((c): c is Element => isTag(c) && c.name.toLowerCase() === name);
}

function children(el: Element, name: string): Element[] {
  return el.children.filter((c): c is Element => isTag(c) && c.name.toLowerCase() === name);
}

function date(value: string, now: number): number {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : now;
}

function article(
  fields: { guid: string; title: string; link?: string; subtitle?: string; publishedAt: number; html?: string },
): ParsedArticle | undefined {
  const guid = clip(fields.guid || fields.link || '', MAX_GUID);
  if (!guid || !fields.title) return undefined;
  const out: ParsedArticle = { guid, title: clip(fields.title, MAX_TITLE), publishedAt: fields.publishedAt };
  if (fields.link) out.link = fields.link;
  if (fields.subtitle) out.subtitle = clip(fields.subtitle, MAX_SUBTITLE);
  if (fields.html) out.html = fields.html;
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
    html: child(item, 'content:encoded') ? DomUtils.textContent(child(item, 'content:encoded')!) : undefined,
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
    html: atomHtml(child(entry, 'content')),
  });
}

/**
 * Reads an RSS 2.0 or Atom document into a Feed and its newest Articles. Custom DOCTYPE
 * entities are never expanded, and every field is capped. `now` dates undated Articles.
 */
export const parseFeed = Effect.fnUntraced(function* (xml: string, now: number) {
  const document = parseDocument(xml, { xmlMode: true, decodeEntities: true });
  const root = document.children.find(isTag);
  const name = root?.name.toLowerCase();

  let feed: ParsedFeed;
  if (root && name === 'rss') {
    const channel = child(root, 'channel');
    if (!channel) return yield* new NotAFeed();
    const base = httpsUrl(text(child(channel, 'link')), NO_BASE) ?? NO_BASE;
    feed = {
      title: clip(plain(text(child(channel, 'title'))), MAX_FEED_TITLE),
      articles: children(channel, 'item').flatMap((item) => rssArticle(item, base, now) ?? []),
    };
  } else if (root && name === 'feed') {
    const self = children(root, 'link').find((l) => !l.attribs.rel || l.attribs.rel === 'alternate');
    const base = httpsUrl(self?.attribs.href, NO_BASE) ?? NO_BASE;
    feed = {
      title: clip(atomText(child(root, 'title')), MAX_FEED_TITLE),
      articles: children(root, 'entry').flatMap((entry) => atomArticle(entry, base, now) ?? []),
    };
  } else {
    return yield* new NotAFeed();
  }

  feed.articles.sort((a, b) => b.publishedAt - a.publishedAt);
  feed.articles = feed.articles.slice(0, MAX_ARTICLES);
  return feed;
});
