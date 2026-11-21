import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

import { vBlock, vOmittedKind } from './lib/feed/validators';

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
  })
    .index('by_user_published', ['userId', 'publishedAt'])
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
