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
  v.literal('already-added'),
);

export type AddFeedReason = Infer<typeof vAddFeedReason>;
