import { v, type Infer } from 'convex/values';

import type { Block } from './blocks';

/** The block format (T17) as Convex validators: the stored shape can't drift from `Block`. */
const vSpan = v.object({
  text: v.string(),
  bold: v.optional(v.literal(true)),
  italic: v.optional(v.literal(true)),
  href: v.optional(v.string()),
});

export const vOmittedKind = v.union(
  v.literal('video'),
  v.literal('table'),
  v.literal('embed'),
  v.literal('code'),
  v.literal('other'),
);

export const vBlock = v.union(
  v.object({ type: v.literal('paragraph'), spans: v.array(vSpan) }),
  v.object({ type: v.literal('heading'), spans: v.array(vSpan) }),
  v.object({ type: v.literal('list'), ordered: v.boolean(), items: v.array(v.array(vSpan)) }),
  v.object({ type: v.literal('quote'), paragraphs: v.array(v.array(vSpan)) }),
  v.object({
    type: v.literal('image'),
    src: v.string(),
    alt: v.optional(v.string()),
    caption: v.optional(v.string()),
    width: v.optional(v.number()),
    height: v.optional(v.number()),
  }),
  v.object({ type: v.literal('omitted'), kind: vOmittedKind }),
);

// Fails to compile if the validator and the converter's type ever disagree.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const blocksMatch: Same<Infer<typeof vBlock>, Block> = true;
void blocksMatch;

/** Why adding a Feed failed, as the app sees it. */
export const vAddFeedReason = v.union(
  v.literal('invalid-url'),
  v.literal('unreachable'),
  v.literal('timeout'),
  v.literal('too-large'),
  v.literal('not-a-feed'),
  v.literal('no-feed-found'),
);

/** A feed a web page advertises, offered to choose from (T21). */
export const vFeedChoice = v.object({ url: v.string(), title: v.string() });

export type AddFeedReason = Infer<typeof vAddFeedReason>;

/** What a Feed said about its version last time (T19). */
export const vValidators = { etag: v.optional(v.string()), lastModified: v.optional(v.string()) };

/**
 * Where reading an Article from its page is up to (T8, FEE-25): waiting, being read (claimed
 * by one run), then extracted or failed.
 */
export const vExtraction = v.union(v.literal('pending'), v.literal('reading'), v.literal('extracted'), v.literal('failed'));

/** What the Reading view is told about a summary-only Article's page: still being read, or couldn't be (Q6). */
export const vReadingPage = v.union(v.literal('extracting'), v.literal('unavailable'));
export type ReadingPage = Infer<typeof vReadingPage>;

/** What reading an Article's page came to: its blocks, or a failure. Either may bring the page's image. */
export const vExtractOutcome = v.union(
  v.object({ _tag: v.literal('Extracted'), blocks: v.array(vBlock), omitted: v.array(vOmittedKind), imageUrl: v.optional(v.string()) }),
  v.object({ _tag: v.literal('Failed'), imageUrl: v.optional(v.string()) }),
);

/** An Article as a fetch hands it to be stored: fields and its cleaned content. */
export const vStoredArticle = v.object({
  guid: v.string(),
  title: v.string(),
  link: v.optional(v.string()),
  subtitle: v.optional(v.string()),
  publishedAt: v.number(),
  imageUrl: v.optional(v.string()),
  blocks: v.array(vBlock),
  omitted: v.array(vOmittedKind),
  /** Summary only, with a page to read it from (T8). */
  extraction: v.optional(v.literal('pending')),
});

export type StoredArticle = Infer<typeof vStoredArticle>;
export type ExtractOutcome = Infer<typeof vExtractOutcome>;
export type Extraction = Infer<typeof vExtraction>;
