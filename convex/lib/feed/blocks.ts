import { isTag, isText, type ChildNode, type Element } from 'domhandler';
import { DomUtils, parseDocument } from 'htmlparser2';

/**
 * An Article's content as feedSmith stores it (T17): a few kinds of block, never HTML.
 * The block format is the allowlist, so nothing else from a page can reach the app (Q8).
 */
export type Span = { text: string; bold?: true; italic?: true; href?: string };

export type OmittedKind = 'video' | 'table' | 'embed' | 'code' | 'other';

export type Block =
  | { type: 'paragraph'; spans: Span[] }
  | { type: 'heading'; spans: Span[] }
  | { type: 'list'; ordered: boolean; items: Span[][] }
  | { type: 'quote'; paragraphs: Span[][] }
  | { type: 'image'; src: string; alt?: string; caption?: string; width?: number; height?: number }
  | { type: 'omitted'; kind: OmittedKind };

export type Content = { blocks: Block[]; omitted: OmittedKind[] };

/** Caps on what one Article can store; past them the rest is noted as omitted. */
export const MAX_BLOCKS = 500;
export const MAX_TEXT = 100_000;
/** Spans per block or list item; past it the rest is kept as plain text. Convex arrays hold 8192. */
export const MAX_SPANS = 1000;
const MAX_ALT = 300;

type Node = ChildNode;

/** Dropped with everything inside them, leaving nothing behind. */
const DROPPED = new Set([
  'script', 'style', 'noscript', 'template', 'head', 'title', 'meta', 'link', 'base',
  'form', 'input', 'button', 'select', 'textarea', 'option', 'label', 'svg', 'math', 'map', 'area',
]);

/** Replaced by an omitted block of their kind (T17). */
const OMITTED: Record<string, OmittedKind> = {
  video: 'video', audio: 'embed', iframe: 'embed', object: 'embed', embed: 'embed', canvas: 'embed',
  table: 'table', pre: 'code',
};

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const BOLD = new Set(['strong', 'b']);
const ITALIC = new Set(['em', 'i', 'cite']);

/** An `https:` URL resolved against the Article's address, or undefined. */
export function httpsUrl(value: string | undefined, base: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function dimension(value: string | undefined): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

function collapse(text: string): string {
  return text.replace(/\s+/g, ' ');
}

/** Converts a Feed's HTML into blocks, dropping everything outside the allowlist. */
export function htmlToBlocks(html: string, base: string): Content {
  const blocks: Block[] = [];
  const omitted: OmittedKind[] = [];
  let textUsed = 0;
  let full = false;

  const markFull = () => {
    if (full) return;
    full = true;
    blocks.push({ type: 'omitted', kind: 'other' });
    omitted.push('other');
  };

  const push = (block: Block, textLength = 0) => {
    if (full) return;
    if (blocks.length >= MAX_BLOCKS || textUsed + textLength > MAX_TEXT) return markFull();
    textUsed += textLength;
    blocks.push(block);
    if (block.type === 'omitted') omitted.push(block.kind);
  };

  /** Inline content of `nodes` as spans, trimmed, with neighbouring like spans merged. */
  const spansOf = (nodes: Node[], style: Omit<Span, 'text'> = {}): Span[] => {
    const out: Span[] = [];
    const walk = (list: Node[], current: Omit<Span, 'text'>) => {
      for (const node of list) {
        if (isText(node)) {
          const text = collapse(node.data);
          if (text) out.push({ text, ...current });
        } else if (isTag(node)) {
          const name = node.name.toLowerCase();
          if (DROPPED.has(name) || name in OMITTED || name === 'img') continue;
          if (name === 'br') {
            out.push({ text: ' ', ...current });
            continue;
          }
          const next = { ...current };
          if (BOLD.has(name)) next.bold = true;
          if (ITALIC.has(name)) next.italic = true;
          if (name === 'a') {
            const href = httpsUrl(node.attribs.href, base);
            delete next.href;
            if (href) next.href = href;
          }
          walk(node.children, next);
        }
      }
    };
    walk(nodes, style);
    return tidy(out);
  };

  const imageOf = (img: Element, caption?: string) => {
    const src = httpsUrl(img.attribs.src, base);
    const width = dimension(img.attribs.width);
    const height = dimension(img.attribs.height);
    // Tracking pixels: images drawn at a couple of pixels or less.
    if (!src || (width !== undefined && width <= 2) || (height !== undefined && height <= 2)) return;
    const alt = img.attribs.alt ? collapse(img.attribs.alt).trim().slice(0, MAX_ALT) : undefined;
    const block: Block = { type: 'image', src };
    if (alt) block.alt = alt;
    if (caption) block.caption = caption;
    if (width) block.width = width;
    if (height) block.height = height;
    push(block, (alt?.length ?? 0) + (caption?.length ?? 0));
  };

  /** Loose inline nodes collected between blocks, flushed as one paragraph. */
  let pending: Node[] = [];
  const flush = () => {
    const spans = spansOf(pending);
    pending = [];
    if (spans.length) push({ type: 'paragraph', spans }, textLength(spans));
  };

  const blockWalk = (nodes: Node[]) => {
    for (const node of nodes) {
      if (full) return;
      if (!isTag(node)) {
        if (isText(node)) pending.push(node);
        continue;
      }
      const name = node.name.toLowerCase();
      const children = node.children;
      if (DROPPED.has(name)) continue;
      if (name in OMITTED) {
        flush();
        push({ type: 'omitted', kind: OMITTED[name] });
      } else if (name === 'p') {
        flush();
        const spans = spansOf(children);
        if (spans.length) push({ type: 'paragraph', spans }, textLength(spans));
        // Images inside a paragraph still count.
        for (const img of DomUtils.getElementsByTagName('img', children)) imageOf(img);
      } else if (HEADINGS.has(name)) {
        flush();
        const spans = spansOf(children);
        if (spans.length) push({ type: 'heading', spans }, textLength(spans));
      } else if (name === 'ul' || name === 'ol') {
        flush();
        const items = children
          .filter((child): child is Element => isTag(child) && child.name.toLowerCase() === 'li')
          .map((li) => spansOf(li.children))
          .filter((spans) => spans.length > 0);
        if (items.length) push({ type: 'list', ordered: name === 'ol', items }, items.reduce((n, s) => n + textLength(s), 0));
      } else if (name === 'blockquote') {
        flush();
        const inner = children.filter((child) => isTag(child) && child.name.toLowerCase() === 'p');
        const paragraphs = (inner.length ? inner.map((p) => spansOf((p as Element).children)) : [spansOf(children)])
          .filter((spans) => spans.length > 0);
        if (paragraphs.length)
          push({ type: 'quote', paragraphs }, paragraphs.reduce((n, s) => n + textLength(s), 0));
      } else if (name === 'figure') {
        flush();
        const figcaption = DomUtils.findOne((el) => el.name.toLowerCase() === 'figcaption', children);
        const caption = figcaption ? DomUtils.textContent(figcaption).replace(/\s+/g, ' ').trim() : undefined;
        const img = DomUtils.findOne((el) => el.name.toLowerCase() === 'img', children);
        const media = DomUtils.findOne((el) => el.name.toLowerCase() in OMITTED, children);
        if (img) imageOf(img, caption || undefined);
        else if (media) push({ type: 'omitted', kind: OMITTED[media.name.toLowerCase()] });
      } else if (name === 'img') {
        flush();
        imageOf(node);
      } else if (isInline(name)) {
        pending.push(node);
      } else {
        // A container (div, section, article…): its children are blocks of their own.
        flush();
        blockWalk(children);
        flush();
      }
    }
  };

  blockWalk(parseDocument(html, { decodeEntities: true }).children);
  flush();
  return { blocks, omitted };
}

const INLINE = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'i', 'ins', 'kbd', 'mark',
  'q', 's', 'samp', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr',
]);

function isInline(name: string): boolean {
  return INLINE.has(name);
}

function textLength(spans: Span[]): number {
  return spans.reduce((n, span) => n + span.text.length, 0);
}

function sameStyle(a: Span, b: Span): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.href === b.href;
}

/** Merges neighbouring spans of one style, and trims the run's ends. */
function tidy(spans: Span[]): Span[] {
  const merged: Span[] = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && sameStyle(last, span)) last.text = collapse(last.text + span.text);
    else merged.push({ ...span });
  }
  if (merged.length > MAX_SPANS) {
    const rest = merged.splice(MAX_SPANS - 1);
    merged.push({ text: rest.map((span) => span.text).join('') });
  }
  if (merged.length) {
    merged[0].text = merged[0].text.trimStart();
    merged[merged.length - 1].text = merged[merged.length - 1].text.trimEnd();
  }
  return merged.filter((span) => span.text.length > 0);
}
