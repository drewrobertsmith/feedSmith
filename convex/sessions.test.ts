/// <reference types="vite/client" />
import { registerCore, sessionIdentity } from '@convex-dev/auth/test';
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { api, components } from './_generated/api';
import schema from './schema';

// No stand-in for getAuthUserId here: these tests run Convex Auth's real session lookup, which
// T26's 15-minute access tokens depend on.
const modules = import.meta.glob('./**/*.ts');

beforeEach(() => {
  vi.stubEnv('CONVEX_CLOUD_URL', 'https://test.convex.cloud');
  vi.stubEnv('CONVEX_SITE_URL', 'https://test.convex.site');
});
afterEach(() => vi.unstubAllEnvs());

/** A signed-in User, called as their session, with a 15-minute access token as the app gets. */
async function signedIn() {
  const t = convexTest(schema, modules);
  registerCore(t);
  const userId = await t.run((ctx) => ctx.db.insert('users', { email: 'ada@example.com', name: 'Ada' }));
  const tokens = await t.run((ctx) =>
    ctx.runMutation(components.auth.public._internal_dangerous_signIn, {
      userId,
      claims: { method: 'google', profile: { id: 'google-ada', email: 'ada@example.com' } },
      componentPath: 'authGoogle',
      accessTokenTtlSeconds: 15 * 60,
      sessionMaxLifetimeSeconds: 30 * 86400,
      refreshInactivityTimeoutSeconds: 30 * 86400,
    }),
  );
  const asAda = t.withIdentity(sessionIdentity(tokens));
  const revokeEverySession = () =>
    t.run(async (ctx) => {
      const sessions = await ctx.runQuery(components.auth.public.listSessions, { userId });
      await ctx.runMutation(components.auth.public.revokeSessions, { sessionIds: sessions.map((s) => s.sessionId) });
    });
  return { asAda, revokeEverySession };
}

test('a live session is the signed-in User', async () => {
  const { asAda } = await signedIn();
  expect(await asAda.query(api.users.viewer, {})).toMatchObject({ email: 'ada@example.com' });
});

test('a revoked session is refused on the next call, though its access token has 15 minutes left (T26)', async () => {
  const { asAda, revokeEverySession } = await signedIn();

  await revokeEverySession();

  expect(await asAda.query(api.users.viewer, {})).toBeNull();
  await expect(asAda.query(api.articles.all, {})).rejects.toThrow(/SIGNED_OUT/);
  await expect(asAda.mutation(api.account.deleteAccount, {})).rejects.toThrow(/SIGNED_OUT/);
});
