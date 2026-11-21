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
  }).index('by_user_url', ['userId', 'url']),
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
    .index('by_feed_guid', ['feedId', 'guid']),
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
