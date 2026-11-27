/// <reference types="vite/client" />
import { registerCore } from '@convex-dev/auth/test';
import { registerGoogleOauth } from '@convex-dev/auth/components/google/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { runScheduledNow } from '../test/convex-scheduled';

import { api, components } from './_generated/api';
import type { Id } from './_generated/dataModel';
import rateLimiterTest from '@convex-dev/rate-limiter/test';
import { GUESSES_PER_HOUR, PAGE_BURST, rateLimiter } from './rateLimits';
import schema from './schema';

// As in auth.test.ts: the test identity's subject is the user id.
vi.mock('@convex-dev/auth/server', async (original) => ({
  ...(await original<typeof import('@convex-dev/auth/server')>()),
  getAuthUserId: async (ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) =>
    (await ctx.auth.getUserIdentity())?.subject ?? null,
}));

const modules = import.meta.glob('./**/*.ts');

beforeEach(() => {
  vi.useFakeTimers();
  // The auth component mints real tokens for the seeded sessions, and names this deployment as their issuer.
  vi.stubEnv('CONVEX_CLOUD_URL', 'https://test.convex.cloud');
  vi.stubEnv('CONVEX_SITE_URL', 'https://test.convex.site');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

/** Each seeded User's Feed, kept to look its page budget up after the Feed is gone. */
const feedOf = new Map<Id<'users'>, Id<'feeds'>>();

/**
 * A User with everything feedSmith keeps for one: a Feed, two Articles with bodies, a session, a Google link,
 * a guessing search used (FEE-88), and a page read from the Feed's budget.
 */
async function seedUser(t: ReturnType<typeof convexTest>, email: string, googleId: string) {
  const userId = await t.run(async (ctx) => {
    const id = await ctx.db.insert('users', { email, name: email.split('@')[0] });
    const feedId = await ctx.db.insert('feeds', { userId: id, url: `https://${email}/feed.xml`, title: 'A Feed' });
    await ctx.db.insert('feedSchedules', { feedId, userId: id, nextFetchAt: Date.now(), failures: 0 });
    for (const guid of ['one', 'two']) {
      const articleId = await ctx.db.insert('articles', { userId: id, feedId, guid, title: guid, publishedAt: Date.now() });
      await ctx.db.insert('articleBodies', { userId: id, articleId, blocks: [], omitted: [] });
      await ctx.db.insert('pageReads', { articleId, feedId, userId: id, state: 'pending' });
    }
    await rateLimiter.limit(ctx, 'pageRead', { key: feedId });
    feedOf.set(id, feedId);
    return id;
  });
  await t.run(async (ctx) => {
    await ctx.runMutation(components.auth.public._internal_dangerous_signIn, {
      userId,
      claims: { method: 'google', profile: { id: googleId, email } },
      componentPath: 'authGoogle',
      accessTokenTtlSeconds: 60,
      sessionMaxLifetimeSeconds: 86400,
      refreshInactivityTimeoutSeconds: 86400,
    });
    await ctx.runMutation(components.authGoogle.provider._internal_dangerous_createAccount, {
      providerAccountId: googleId,
      userId,
    });
    await rateLimiter.limit(ctx, 'guessingSearch', { key: userId });
  });
  return userId;
}

/** Everything any table holds for a User, by table: the app's own and the auth components'. */
async function holdings(t: ReturnType<typeof convexTest>, userId: Id<'users'>, googleId: string) {
  return await t.run(async (ctx) => ({
    users: (await ctx.db.get(userId)) === null ? 0 : 1,
    feeds: (await ctx.db.query('feeds').collect()).filter((row) => row.userId === userId).length,
    feedSchedules: (await ctx.db.query('feedSchedules').collect()).filter((row) => row.userId === userId).length,
    articles: (await ctx.db.query('articles').collect()).filter((row) => row.userId === userId).length,
    articleBodies: (await ctx.db.query('articleBodies').collect()).filter((row) => row.userId === userId).length,
    pageReads: (await ctx.db.query('pageReads').collect()).filter((row) => row.userId === userId).length,
    sessions: (await ctx.runQuery(components.auth.public.listSessions, { userId })).length,
    googleLink: (await ctx.runQuery(components.authGoogle.provider.getUserIdByAccount, { providerAccountId: googleId })) === null ? 0 : 1,
    // A used guessing search shows as an allowance short of full; none left behind means a full one (FEE-88).
    searchesUsed: (await rateLimiter.check(ctx, 'guessingSearch', { key: userId, count: GUESSES_PER_HOUR })).ok ? 0 : 1,
    // Likewise a Feed's page budget, keyed by the Feed: it goes with the Account.
    pagesUsed: (await rateLimiter.check(ctx, 'pageRead', { key: feedOf.get(userId)!, count: PAGE_BURST })).ok ? 0 : 1,
  }));
}

const NOTHING = { users: 0, feeds: 0, feedSchedules: 0, articles: 0, articleBodies: 0, pageReads: 0, sessions: 0, googleLink: 0, searchesUsed: 0, pagesUsed: 0 };
const EVERYTHING = { users: 1, feeds: 1, feedSchedules: 1, articles: 2, articleBodies: 2, pageReads: 2, sessions: 1, googleLink: 1, searchesUsed: 1, pagesUsed: 1 };

async function setup() {
  const t = convexTest(schema, modules);
  registerCore(t);
  registerGoogleOauth(t);
  rateLimiterTest.register(t);
  const a = await seedUser(t, 'a@example.com', 'google-a');
  const b = await seedUser(t, 'b@example.com', 'google-b');
  return { t, a, b, asA: t.withIdentity({ subject: a }), asB: t.withIdentity({ subject: b }) };
}

describe('deleteAccount (P18)', () => {
  test('a signed-out caller is refused, and nothing is deleted (Q10)', async () => {
    const { t, a } = await setup();
    await expect(t.mutation(api.account.deleteAccount, {})).rejects.toThrow(/SIGNED_OUT/);
    expect(await holdings(t, a, 'google-a')).toEqual(EVERYTHING);
  });

  test('it takes no arguments: a caller can only ever delete their own Account', async () => {
    const { t, a, asB } = await setup();
    await expect(asB.mutation(api.account.deleteAccount, { userId: a } as never)).rejects.toThrow(/userId/);
    expect(await holdings(t, a, 'google-a')).toEqual(EVERYTHING);
  });

  test('deleting User A leaves nothing of A in any User table, and B untouched (Q28)', async () => {
    const { t, a, b, asA } = await setup();

    await asA.mutation(api.account.deleteAccount, {});
    await runScheduledNow(t);

    expect(await holdings(t, a, 'google-a')).toEqual(NOTHING);
    expect(await holdings(t, b, 'google-b')).toEqual(EVERYTHING);
  });

  test('the Account and its sign-in are gone at once; only Articles wait for the batches', async () => {
    const { t, a, asA } = await setup();

    await asA.mutation(api.account.deleteAccount, {});

    expect(await holdings(t, a, 'google-a')).toMatchObject({ users: 0, feeds: 0, feedSchedules: 0, sessions: 0, googleLink: 0 });
  });

  test('deleting an Account that is already gone fails cleanly', async () => {
    const { t, asA } = await setup();
    await asA.mutation(api.account.deleteAccount, {});
    await runScheduledNow(t);

    await expect(asA.mutation(api.account.deleteAccount, {})).rejects.toThrow(/ACCOUNT_GONE/);
  });

  test('a User with more Articles than one batch still loses them all', async () => {
    const { t, a, asA } = await setup();
    await t.run(async (ctx) => {
      const feed = (await ctx.db.query('feeds').collect()).find((row) => row.userId === a)!;
      for (let i = 0; i < 250; i += 1) {
        await ctx.db.insert('articles', { userId: a, feedId: feed._id, guid: `bulk-${i}`, title: 'x', publishedAt: i });
      }
    });

    await asA.mutation(api.account.deleteAccount, {});
    await runScheduledNow(t);

    expect(await holdings(t, a, 'google-a')).toEqual(NOTHING);
  });

  test('the same Google account can sign up again from scratch afterwards', async () => {
    const { t, asA } = await setup();
    await asA.mutation(api.account.deleteAccount, {});

    // Sign-in looks the Google account up first; with no link left, it creates a new User.
    const linked = await t.run((ctx) =>
      ctx.runQuery(components.authGoogle.provider.getUserIdByAccount, { providerAccountId: 'google-a' }),
    );
    expect(linked).toBeNull();
  });
});
