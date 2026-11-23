import { isTag, isText, type ChildNode, type Element } from 'domhandler';
import { parseDocument } from 'htmlparser2';

import { boundNesting } from './nesting';

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
/**
 * The stored JSON of one Article's blocks, in characters, overhead included. At most three
 * bytes a character, it keeps an Article well under Convex's 1 MiB document limit.
 */
export const MAX_SIZE = 250_000;
/**
 * Articles deleted per transaction, with their bodies. A body can reach about 750 KB (MAX_SIZE at
 * three bytes a character), so 16 keep a batch under the 16 MiB a transaction may read and write.
 */
export const DELETE_BATCH = 16;
/** Entries in one list, or paragraphs in one quote. */
export const MAX_ENTRIES = 1000;
/** Nesting deeper than this is hostile, not writing; it's left out rather than walked. */
export const MAX_DEPTH = 64;
/** Spans per block or list item; past it the rest is kept as plain text. Convex arrays hold 8192. */
export const MAX_SPANS = 1000;
const MAX_ALT = 300;

type Node = ChildNode;

/** Dropped with everything inside them, leaving nothing behind. */
const DROPPED = new Set([
  'script', 'style', 'noscript', 'template', 'head', 'title', 'meta', 'link', 'base',
  'form', 'input', 'button', 'select', 'textarea', 'option', 'label', 'svg', 'math', 'map', 'area',
]);

/** Replaced by an omitted block of their kind (T17). A Map: tag names can be `constructor`. */
const OMITTED = new Map<string, OmittedKind>([
  ['video', 'video'], ['audio', 'embed'], ['iframe', 'embed'], ['object', 'embed'], ['embed', 'embed'],
  ['canvas', 'embed'], ['table', 'table'], ['pre', 'code'],
]);

const tagName = (node: Element) => node.name.toLowerCase();

/** The first element under `nodes` (depth-limited) that `test` accepts. */
function findFirst(nodes: Node[], test: (el: Element) => boolean, depth = 0): Element | undefined {
  if (depth > MAX_DEPTH) return undefined;
  for (const node of nodes) {
    if (!isTag(node)) continue;
    if (test(node)) return node;
    const found = findFirst(node.children, test, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** Every element under `nodes` (depth-limited) that `test` accepts. */
function findAll(nodes: Node[], test: (el: Element) => boolean, depth = 0, out: Element[] = []): Element[] {
  if (depth > MAX_DEPTH) return out;
  for (const node of nodes) {
    if (!isTag(node)) continue;
    if (test(node)) out.push(node);
    findAll(node.children, test, depth + 1, out);
  }
  return out;
}

/** The plain text under `nodes`, depth-limited. */
function textOf(nodes: Node[], depth = 0): string {
  if (depth > MAX_DEPTH) return '';
  return nodes.map((node) => (isText(node) ? node.data : isTag(node) ? textOf(node.children, depth + 1) : '')).join('');
}

const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);
const BOLD = new Set(['strong', 'b']);
const ITALIC = new Set(['em', 'i', 'cite']);

/** A base for resolving links when a Feed gives no address of its own; it resolves nothing real. */
export const NO_BASE = 'https://invalid.invalid/';

/** An `https:` URL resolved against the Article's address, or undefined. */
export function httpsUrl(value: string | undefined, base: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim(), base);
    // A relative address in a Feed with no address of its own resolves to nothing real.
    return url.protocol === 'https:' && !url.href.startsWith(NO_BASE) ? url.href : undefined;
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
  let size = 2; // the array's brackets
  let full = false;

  const markFull = () => {
    if (full) return;
    full = true;
    blocks.push({ type: 'omitted', kind: 'other' });
    omitted.push('other');
  };

  const push = (block: Block) => {
    if (full) return;
    const blockSize = JSON.stringify(block).length + 1;
    if (blocks.length >= MAX_BLOCKS || size + blockSize > MAX_SIZE) return markFull();
    size += blockSize;
    blocks.push(block);
    if (block.type === 'omitted') omitted.push(block.kind);
  };

  /** Inline content of `nodes` as spans, trimmed, with neighbouring like spans merged. */
  const spansOf = (nodes: Node[], style: Omit<Span, 'text'> = {}): Span[] => {
    const out: Span[] = [];
    const walk = (list: Node[], current: Omit<Span, 'text'>, depth: number) => {
      if (depth > MAX_DEPTH) return;
      for (const node of list) {
        if (isText(node)) {
          const text = collapse(node.data);
          if (text) out.push({ text, ...current });
        } else if (isTag(node)) {
          const name = tagName(node);
          if (DROPPED.has(name) || OMITTED.has(name) || name === 'img') continue;
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
          walk(node.children, next, depth + 1);
        }
      }
    };
    walk(nodes, style, 0);
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
    push(block);
  };

  /** Loose inline nodes collected between blocks, flushed as one paragraph. */
  let pending: Node[] = [];
  const flush = () => {
    const spans = spansOf(pending);
    pending = [];
    if (spans.length) push({ type: 'paragraph', spans });
  };

  /** Up to MAX_ENTRIES, noting the rest as omitted. */
  const capped = <T,>(entries: T[]): T[] => {
    if (entries.length <= MAX_ENTRIES) return entries;
    overflowed = true;
    return entries.slice(0, MAX_ENTRIES);
  };
  let overflowed = false;

  const blockWalk = (nodes: Node[], depth: number) => {
    if (depth > MAX_DEPTH) return markFull();
    for (const node of nodes) {
      if (full) return;
      if (!isTag(node)) {
        if (isText(node)) pending.push(node);
        continue;
      }
      const name = tagName(node);
      const children = node.children;
      const omittedKind = OMITTED.get(name);
      if (DROPPED.has(name)) continue;
      if (omittedKind) {
        flush();
        push({ type: 'omitted', kind: omittedKind });
      } else if (name === 'p') {
        flush();
        const spans = spansOf(children);
        if (spans.length) push({ type: 'paragraph', spans });
        // Images inside a paragraph still count.
        for (const img of findAll(children, (el) => tagName(el) === 'img')) imageOf(img);
      } else if (HEADINGS.has(name)) {
        flush();
        const spans = spansOf(children);
        if (spans.length) push({ type: 'heading', spans });
      } else if (name === 'ul' || name === 'ol') {
        flush();
        const items = capped(
          children
            .filter((child): child is Element => isTag(child) && tagName(child) === 'li')
            .map((li) => spansOf(li.children))
            .filter((spans) => spans.length > 0),
        );
        if (items.length) push({ type: 'list', ordered: name === 'ol', items });
      } else if (name === 'blockquote') {
        flush();
        const inner = children.filter((child): child is Element => isTag(child) && tagName(child) === 'p');
        const paragraphs = capped(
          (inner.length ? inner.map((p) => spansOf(p.children)) : [spansOf(children)]).filter((spans) => spans.length > 0),
        );
        if (paragraphs.length) push({ type: 'quote', paragraphs });
      } else if (name === 'figure') {
        flush();
        const figcaption = findFirst(children, (el) => tagName(el) === 'figcaption');
        const caption = figcaption ? collapse(textOf(figcaption.children)).trim() : undefined;
        const img = findFirst(children, (el) => tagName(el) === 'img');
        const media = findFirst(children, (el) => OMITTED.has(tagName(el)));
        if (img) imageOf(img, caption || undefined);
        else if (media) push({ type: 'omitted', kind: OMITTED.get(tagName(media))! });
      } else if (name === 'img') {
        flush();
        imageOf(node);
      } else if (isInline(name)) {
        pending.push(node);
      } else {
        // A container (div, section, article…): its children are blocks of their own.
        flush();
        blockWalk(children, depth + 1);
        flush();
      }
      if (overflowed) markFull();
    }
  };

  // Nesting past any real page's is cut before parsing, and what it cut is noted as left out (FEE-57).
  const bounded = boundNesting(html);
  blockWalk(parseDocument(bounded, { decodeEntities: true }).children, 0);
  flush();
  if (bounded.length < html.length) markFull();
  return { blocks, omitted };
}

const INLINE = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'i', 'ins', 'kbd', 'mark',
  'q', 's', 'samp', 'small', 'span', 'strike', 'strong', 'sub', 'sup', 'time', 'u', 'var', 'wbr',
]);

function isInline(name: string): boolean {
  return INLINE.has(name);
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
