import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

import { vBlock, vExtraction, vOmittedKind } from './lib/feed/validators';

export default defineSchema({
  users: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
  }),
  /** A User's Feeds. `url` is a secret: never logged, never returned to the app (T9, Q9). */
  feeds: defineTable({
    userId: v.id('users'),
    url: v.string(),
    title: v.string(),
    /** The site's origin, from the Feed's own link (not the secret feed URL); its favicon lives there. */
    siteUrl: v.optional(v.string()),
    /** The icon the site names for itself (T21); else `/favicon.ico` on `siteUrl`. */
    iconUrl: v.optional(v.string()),
    /** Set when Pinned (P9): Pinned chips follow All in this order, at most three. */
    pinOrder: v.optional(v.number()),
    /** Whether its last fetch worked (P15). Optional only for Feeds stored before FEE-24. */
    status: v.optional(v.union(v.literal('working'), v.literal('failing'))),
    /** Failed fetches in a row; each backs the next try off further (Q7). */
    failures: v.optional(v.number()),
    lastFetchedAt: v.optional(v.number()),
    /** When it's next due (T19). Unset means due now. */
    nextFetchAt: v.optional(v.number()),
    /** What the Feed said about its version last time, sent back on the next check (T19). */
    etag: v.optional(v.string()),
    lastModified: v.optional(v.string()),
  })
    .index('by_user_url', ['userId', 'url'])
    .index('by_user_pin', ['userId', 'pinOrder'])
    .index('by_next_fetch', ['nextFetchAt']),
  /** A User's Articles: what All lists. Their content lives in `articleBodies`. */
  articles: defineTable({
    userId: v.id('users'),
    feedId: v.id('feeds'),
    guid: v.string(),
    title: v.string(),
    link: v.optional(v.string()),
    subtitle: v.optional(v.string()),
    publishedAt: v.number(),
    /** The lead image All shows beside it (https). */
    imageUrl: v.optional(v.string()),
    /** When the User first opened it (P7). */
    readAt: v.optional(v.number()),
    /**
     * Reading a summary-only Article in full from its page (T8, FEE-25): `pending`, `reading`
     * while one run has it, then `extracted` or `failed`. Absent when the Feed carries its full text.
     */
    extraction: v.optional(vExtraction),
  })
    .index('by_user_published', ['userId', 'publishedAt'])
    .index('by_feed_extraction', ['feedId', 'extraction'])
    .index('by_feed_guid', ['feedId', 'guid'])
    .index('by_feed_published', ['feedId', 'publishedAt'])
    .index('by_published', ['publishedAt']),
  /**
   * An Article's content as cleaned blocks (T17), apart from the Article so All reads
   * only titles and dates, never the bodies.
   */
  articleBodies: defineTable({
    userId: v.id('users'),
    articleId: v.id('articles'),
    blocks: v.array(vBlock),
    omitted: v.array(vOmittedKind),
  }).index('by_article', ['articleId']),
});
