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
    /**
     * Whether its last fetch worked (P15), for Manage Feeds. Written only when it changes, so a
     * routine check never touches the Feed (FEE-54). Optional only for Feeds stored before FEE-24.
     */
    status: v.optional(v.union(v.literal('working'), v.literal('failing'))),
    /** Deprecated (FEE-54): moved to `feedSchedules` by `migrations.moveFeedSchedules`; removed once every deployment has run it. */
    failures: v.optional(v.number()),
    lastFetchedAt: v.optional(v.number()),
    nextFetchAt: v.optional(v.number()),
    etag: v.optional(v.string()),
    lastModified: v.optional(v.string()),
  })
    .index('by_user_url', ['userId', 'url'])
    .index('by_user_pin', ['userId', 'pinOrder']),
  /**
   * When each Feed is next fetched, and what its last fetch learned (T19, FEE-54). Kept apart from
   * the Feed so a check, every few minutes, re-runs nothing the screens read.
   */
  feedSchedules: defineTable({
    feedId: v.id('feeds'),
    userId: v.id('users'),
    /** When it's next due; a lease pushes it out while a fetch runs. 0 means due now. */
    nextFetchAt: v.number(),
    lastFetchedAt: v.optional(v.number()),
    /** Failed fetches in a row; each backs the next try off further (Q7). */
    failures: v.number(),
    /** What the Feed said about its version last time, sent back on the next check (T19). */
    etag: v.optional(v.string()),
    lastModified: v.optional(v.string()),
  })
    .index('by_feed', ['feedId'])
    .index('by_next_fetch', ['nextFetchAt'])
    .index('by_user', ['userId']),
  /**
   * The fetch scheduler's one booked run (FEE-55): at most one row, holding the scheduled
   * `refresh.scheduleDue`, so it can be moved or cancelled instead of a second one piling up.
   */
  fetchTimer: defineTable({
    scheduledId: v.id('_scheduled_functions'),
  }),
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
    /** Who wrote it, by name only; never an email (FEE-41). */
    authors: v.optional(v.array(v.string())),
    /** When the User first opened it (P7). */
    readAt: v.optional(v.number()),
    /** Deprecated (FEE-62): moved to `pageReads` by `migrations.movePageReads`; removed with FEE-56. */
    extraction: v.optional(vExtraction),
  })
    .index('by_user_published', ['userId', 'publishedAt'])
    .index('by_feed_guid', ['feedId', 'guid'])
    .index('by_feed_published', ['feedId', 'publishedAt'])
    .index('by_published', ['publishedAt']),
  /**
   * Reading a summary-only Article in full from its page (T8, T24): `pending`, `reading` while
   * one run has it, or `failed`. No row once its text is whole, or when its Feed carried full
   * text. Kept apart from the Article so reading pages re-runs nothing All shows (FEE-62).
   */
  pageReads: defineTable({
    articleId: v.id('articles'),
    feedId: v.id('feeds'),
    userId: v.id('users'),
    state: v.union(v.literal('pending'), v.literal('reading'), v.literal('failed')),
  })
    .index('by_article', ['articleId'])
    .index('by_feed_state', ['feedId', 'state']),
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
