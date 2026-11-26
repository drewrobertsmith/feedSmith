import { v, type Infer } from 'convex/values';
import { Effect, Option, Schema } from 'effect';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { action, internalAction, internalMutation, query, type QueryCtx } from './_generated/server';
import { requireUserId } from './lib/currentUser';
import { faviconOf, hostOf, siteHost } from './lib/feed/face';
import { fetchFeed } from './lib/feed/fetch';
import { candidates, hostMatch, isStrong, nameMatch, rank, searchTerms, siteLabel } from './lib/feed/find';
import { safeUrl } from './lib/feed/http';
import { Budget, proveSite } from './lib/feed/prove';
import { ServerLayer } from './lib/feed/server';
import { rateLimiter } from './rateLimits';

/** Catalog entries one search reads from the search index, at most (Q10). */
const SEARCH_LIMIT = 20;
/** Results one search shows at most: a list to choose from, not a directory. */
const MAX_RESULTS = 20;
/** Feeds a User follows, at most (the chip row's own cap). */
const FOLLOWED_LIMIT = 200;
/** Proven results the app may ask for by address, the search index having missed them (a typo). */
const MAX_ALSO = 16;
const MAX_URL = 2048;
/** Fetches one search makes at most, across every guessed site. */
const MAX_FETCHES = 40;
/** Sites guessed at once. */
const CONCURRENCY = 4;
/** A search ends this long after it starts, cancelling every fetch still running (FEE-109). */
const DEADLINE_MS = 20_000;
/** Entries not found or fetched for this long are dropped. */
const KEEP_MS = 365 * 24 * 60 * 60_000;
/** Entries one cleanup deletes before booking the next. */
const FORGET_BATCH = 200;

/** The site of that very name is proven: the search has its answer, and stops (FEE-109). */
class StrongMatch extends Schema.TaggedError<StrongMatch>()('StrongMatch', {}) {}

const vSource = v.union(v.literal('declared'), v.literal('common-path'));

/** A Feed found by name: one you already follow (by its id, never its URL, Q9), or one to add. */
const vFound = v.union(
  v.object({ kind: v.literal('following'), feedId: v.id('feeds'), title: v.string(), host: v.string(), iconUrl: v.optional(v.string()) }),
  v.object({ kind: v.literal('new'), url: v.string(), title: v.string(), host: v.string(), iconUrl: v.optional(v.string()) }),
);
type Found = Infer<typeof vFound>;

/** What a name matches: by the site's own name, or by its host being the name. */
const matches = (typed: string, name: string, host: string) => nameMatch(typed, name) > 0 || hostMatch(typed, host);

/** Catalog entries for a name, from the search index only: bounded, no fetching (Q10). */
function catalogHits(ctx: QueryCtx, terms: string) {
  return ctx.db
    .query('feedCatalog')
    .withSearchIndex('search_text', (q) => q.search('searchText', terms))
    .take(SEARCH_LIMIT);
}

/**
 * Searching for a Feed by its site's name (FEE-80): the signed-in User's own Feeds that match
 * ("You already follow The Verge", T22), then the catalog's, ranked. Reactive, so Feeds proven by
 * `find` appear as each joins the catalog. `also` adds proven Feeds the index missed (a typo).
 */
export const search = query({
  args: { name: v.string(), also: v.optional(v.array(v.string())) },
  returns: v.array(vFound),
  handler: async (ctx, { name, also }): Promise<Found[]> => {
    const userId = await requireUserId(ctx);
    const terms = searchTerms(name);
    if (!terms) return [];

    const hits = await catalogHits(ctx, terms);
    const extra = (also ?? []).slice(0, MAX_ALSO).filter((url) => url.length <= MAX_URL);
    const asked = await Promise.all(
      extra.map((url) =>
        ctx.db
          .query('feedCatalog')
          .withIndex('by_url', (q) => q.eq('url', url))
          .unique(),
      ),
    );
    const seen = new Set(hits.map((hit) => hit._id));
    for (const entry of asked) {
      if (entry && !seen.has(entry._id)) {
        seen.add(entry._id);
        hits.push(entry);
      }
    }

    const feeds = await ctx.db
      .query('feeds')
      .withIndex('by_user_url', (q) => q.eq('userId', userId))
      .take(FOLLOWED_LIMIT);
    const byUrl = new Map(feeds.map((feed) => [feed.url, feed]));
    const following = new Map<Id<'feeds'>, Doc<'feeds'>>();
    for (const feed of feeds) if (matches(name, feed.title, hostOf(feed))) following.set(feed._id, feed);
    for (const hit of hits) {
      const feed = byUrl.get(hit.url);
      if (feed && matches(name, hit.name, hit.host)) following.set(feed._id, feed);
    }

    const followed: Found[] = rank(
      name,
      [...following.values()].map((feed) => ({ feed, name: feed.title, host: siteHost(`https://${hostOf(feed)}`) })),
    ).map(({ feed, name: title, host }) => {
      const found: Found = { kind: 'following', feedId: feed._id, title, host };
      const iconUrl = faviconOf(feed);
      if (iconUrl) found.iconUrl = iconUrl;
      return found;
    });
    const fresh: Found[] = rank(
      name,
      hits.filter((hit) => !byUrl.has(hit.url) && matches(name, hit.name, hit.host)),
    ).map((hit) => {
      const found: Found = { kind: 'new', url: hit.url, title: hit.name, host: hit.host };
      if (hit.iconUrl) found.iconUrl = hit.iconUrl;
      return found;
    });
    return [...followed, ...fresh].slice(0, MAX_RESULTS);
  },
});

/**
 * Whether feedSmith already knows the Feed for this name, so nothing is guessed: the User follows
 * one of that name or on the site of that name ("You already follow…", T22), or the catalog holds
 * it on the site of that name.
 */
async function known(ctx: QueryCtx, userId: Id<'users'>, name: string): Promise<boolean> {
  const terms = searchTerms(name);
  if (!terms) return false;
  const feeds = await ctx.db
    .query('feeds')
    .withIndex('by_user_url', (q) => q.eq('userId', userId))
    .take(FOLLOWED_LIMIT);
  if (feeds.some((feed) => nameMatch(name, feed.title) === 3 || hostMatch(name, hostOf(feed)))) return true;
  return (await catalogHits(ctx, terms)).some((hit) => isStrong(name, hit));
}

/**
 * Whether a search may guess (T36), decided in one transaction with the User still there: `known`
 * when feedSmith already has the Feed (free), `limited` past the User's allowance, else `guess`,
 * charging one search. Done together, a search racing an Account's deletion can't leave a counter
 * behind for the deleted User (Q28).
 */
export const startGuessing = internalMutation({
  args: { userId: v.id('users'), name: v.string() },
  returns: v.union(v.literal('known'), v.literal('limited'), v.literal('guess')),
  handler: async (ctx, { userId, name }) => {
    if ((await ctx.db.get(userId)) === null) return 'known';
    if (await known(ctx, userId, name)) return 'known';
    const { ok } = await rateLimiter.limit(ctx, 'guessingSearch', { key: userId });
    return ok ? 'guess' : 'limited';
  },
});

/**
 * Finds Feeds for a site's name by guessing its address and proving it (FEE-80, T35): a few sites
 * at a time, under one fetch budget and deadline, stopping once the site of that very name is
 * proven. The deadline and the stop both cancel whatever is still being fetched (FEE-109). Each proven Feed joins the catalog at once, so `search` shows it as it's found. Nothing
 * is guessed when feedSmith already knows the Feed (`known`), and a User past their allowance of
 * guessing searches is answered `limited` without fetching (FEE-88). Returns the proven Feeds' addresses.
 */
export const find = action({
  args: { name: v.string() },
  // `limited`: the User has used up their guessing searches for now (FEE-88); nothing was fetched.
  returns: v.object({ found: v.array(v.string()), limited: v.optional(v.literal(true)) }),
  handler: async (ctx, { name }) => {
    const userId = await ctx.runQuery(internal.feeds.viewer, {});
    const hosts = candidates(name);
    if (hosts.length === 0) return { found: [] };
    // Only a search that will guess is counted, and before any fetch (T36).
    const start = await ctx.runMutation(internal.catalog.startGuessing, { userId, name });
    if (start === 'known') return { found: [] };
    if (start === 'limited') return { found: [], limited: true as const };

    const budget = new Budget(MAX_FETCHES);
    const tried = new Set<string>();
    const found: string[] = [];
    // One site at a time per lane, four lanes. A proven Feed is remembered and returned as one
    // step, never cut in half; a strong match then ends the search, cancelling the rest.
    const guess = Effect.fnUntraced(function* (host: string) {
      const proven = yield* proveSite(host, name, budget, tried);
      if (!proven) return;
      yield* Effect.uninterruptible(
        Effect.promise(() => ctx.runMutation(internal.catalog.remember, { ...proven, now: Date.now() })).pipe(
          Effect.tap(() => Effect.sync(() => found.push(proven.url))),
        ),
      );
      if (isStrong(name, proven)) return yield* new StrongMatch();
    });
    await Effect.runPromise(
      Effect.forEach(hosts, guess, { concurrency: CONCURRENCY, discard: true }).pipe(
        Effect.as('exhausted' as const),
        Effect.catchTag('StrongMatch', () => Effect.succeed('strong-match' as const)),
        // The deadline cancels every fetch still running and aborts its request (FEE-109).
        Effect.timeoutOption(DEADLINE_MS),
        Effect.map(Option.getOrElse(() => 'deadline' as const)),
        // How it ended, never the name typed or the sites guessed (FEE-113).
        Effect.flatMap((ended) =>
          Effect.logInfo('guessing search').pipe(Effect.annotateLogs({ ended, fetches: budget.used, found: found.length })),
        ),
        Effect.provide(ServerLayer),
      ),
    );
    return { found };
  },
});

/** The words the search index holds for an entry: its name's, and its site's label ("theverge"). */
const searchTextOf = (name: string, host: string) => `${name} ${siteLabel(host)}`;

/**
 * Puts a public Feed in the catalog, or refreshes it: its name and icon, when it was last seen,
 * and how often it's been found. Internal only: what enters is decided on the server (T35).
 */
export const remember = internalMutation({
  args: {
    url: v.string(),
    name: v.string(),
    host: v.string(),
    siteUrl: v.string(),
    iconUrl: v.optional(v.string()),
    source: vSource,
    now: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, { url, name, host, siteUrl, iconUrl, source, now }) => {
    if (url.length > MAX_URL || !safeUrl(url)) return null;
    const existing = await ctx.db
      .query('feedCatalog')
      .withIndex('by_url', (q) => q.eq('url', url))
      .unique();
    const fields = { name, host, siteUrl, iconUrl, searchText: searchTextOf(name, host), seenAt: now };
    if (existing) {
      // Declared beats guessed: once a homepage has said so, it stays declared.
      await ctx.db.patch(existing._id, { ...fields, source: existing.source === 'declared' ? 'declared' : source, finds: existing.finds + 1 });
    } else {
      await ctx.db.insert('feedCatalog', { url, ...fields, source, finds: 1 });
    }
    return null;
  },
});

/**
 * A Feed fetched again, when it's already in the catalog: refreshes its name, icon and when it was
 * seen. Never adds one, so a typed URL can't enter the catalog this way (T35).
 */
export const touch = internalMutation({
  args: { url: v.string(), name: v.string(), iconUrl: v.optional(v.string()), now: v.number() },
  returns: v.null(),
  handler: async (ctx, { url, name, iconUrl, now }) => {
    const existing = await ctx.db
      .query('feedCatalog')
      .withIndex('by_url', (q) => q.eq('url', url))
      .unique();
    if (!existing) return null;
    await ctx.db.patch(existing._id, { name, iconUrl: iconUrl ?? existing.iconUrl, searchText: searchTextOf(name, existing.host), seenAt: now });
    return null;
  },
});

/**
 * A homepage declared several feeds and the User was offered a choice: its first is proven in the
 * background (it must parse) and, if it does, joins the catalog.
 */
export const rememberDeclared = internalAction({
  args: { url: v.string(), name: v.string(), siteUrl: v.string(), iconUrl: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, { url, name, siteUrl, iconUrl }) => {
    const outcome = await fetchFeed(url);
    if (outcome._tag !== 'Fetched') return null;
    const host = siteHost(siteUrl);
    await ctx.runMutation(internal.catalog.remember, { url, name, host, siteUrl, iconUrl, source: 'declared', now: Date.now() });
    return null;
  },
});

/** Drops catalog entries not seen for a year, a batch at a time (daily, from `crons.ts`). */
export const forget = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const stale = await ctx.db
      .query('feedCatalog')
      .withIndex('by_seen', (q) => q.lt('seenAt', Date.now() - KEEP_MS))
      .take(FORGET_BATCH);
    await Promise.all(stale.map((entry) => ctx.db.delete(entry._id)));
    if (stale.length === FORGET_BATCH) await ctx.scheduler.runAfter(0, internal.catalog.forget, {});
    return null;
  },
});
