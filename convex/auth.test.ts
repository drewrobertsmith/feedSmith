/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { internal } from './_generated/api';
import { canSignUp } from './lib/signUp';
import { requireUserId } from './lib/currentUser';
import schema from './schema';

// Convex Auth resolves a user through a session in its own component, and the Google
// method has no test helper to create one. So its one lookup is replaced here: the
// test identity's subject is the user id. Everything feedSmith owns runs for real.
vi.mock('@convex-dev/auth/server', async (original) => ({
  ...(await original<typeof import('@convex-dev/auth/server')>()),
  getAuthUserId: async (ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) =>
    (await ctx.auth.getUserIdentity())?.subject ?? null,
}));

const modules = import.meta.glob('./**/*.ts');

const google = (email: string | undefined, emailVerified = true) => ({
  method: { name: 'google' as const, profile: { id: `g-${email}`, email, emailVerified } },
});

describe('who may sign up (T15)', () => {
  test.each([
    ['listed and verified', 'reader@example.com', true, 'reader@example.com', true],
    ['listed among several', 'b@example.com', true, 'a@example.com, b@example.com', true],
    ['case and spacing differ', ' Reader@Example.COM ', true, 'reader@example.com', true],
    ['not on the list', 'stranger@example.com', true, 'reader@example.com', false],
    ['on the list but Google has not verified it', 'reader@example.com', false, 'reader@example.com', false],
    ['no email from Google', undefined, true, 'reader@example.com', false],
    ['the list is empty', 'reader@example.com', true, '', false],
    ['the list is not set', 'reader@example.com', true, undefined, false],
  ])('%s', (_case, email, emailVerified, allowlist, allowed) => {
    expect(canSignUp({ email, emailVerified }, allowlist)).toBe(allowed);
  });
});

describe('createUser for Google', () => {
  beforeEach(() => vi.stubEnv('AUTH_ALLOWED_EMAILS', 'reader@example.com'));
  afterEach(() => vi.unstubAllEnvs());

  test('creates the user for an allowed account', async () => {
    const t = convexTest(schema, modules);
    const userId = await t.mutation(internal.users.createUserGoogle, google('Reader@example.com'));
    const user = await t.run((ctx) => ctx.db.get(userId));
    expect(user?.email).toBe('reader@example.com');
  });

  test('refuses an account off the list, and creates nothing', async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(internal.users.createUserGoogle, google('stranger@example.com'))).rejects.toThrow(
      /NOT_ALLOWED/,
    );
    expect(await t.run((ctx) => ctx.db.query('users').collect())).toEqual([]);
  });

  test('refuses an email Google has not verified', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(internal.users.createUserGoogle, google('reader@example.com', false)),
    ).rejects.toThrow(/NOT_ALLOWED/);
  });
});

describe('the signed-in user (Q10)', () => {
  test('a signed-out caller is refused', async () => {
    const t = convexTest(schema, modules);
    await expect(t.run((ctx) => requireUserId(ctx))).rejects.toThrow(/SIGNED_OUT/);
  });

  test('each caller gets their own user, never another', async () => {
    const t = convexTest(schema, modules);
    const [alice, bob] = await t.run(async (ctx) => [
      await ctx.db.insert('users', { email: 'alice@example.com' }),
      await ctx.db.insert('users', { email: 'bob@example.com' }),
    ]);
    expect(await t.withIdentity({ subject: alice }).run((ctx) => requireUserId(ctx))).toBe(alice);
    expect(await t.withIdentity({ subject: bob }).run((ctx) => requireUserId(ctx))).toBe(bob);
  });
});

describe('the return link (/auth/app)', () => {
  test('forwards the sign-in code to the app', async () => {
    const t = convexTest(schema, modules);
    const response = await t.fetch('/auth/app?convexAuthCode=abc123', { redirect: 'manual' });
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('feedsmith://auth?convexAuthCode=abc123');
  });

  test('forwards a sign-in error to the app', async () => {
    const t = convexTest(schema, modules);
    const response = await t.fetch('/auth/app?convexAuthError=ACCESS_DENIED', { redirect: 'manual' });
    expect(response.headers.get('Location')).toBe('feedsmith://auth?convexAuthError=ACCESS_DENIED');
  });

  test('only ever sends to feedsmith://auth, dropping anything else', async () => {
    const t = convexTest(schema, modules);
    const response = await t.fetch(
      '/auth/app?convexAuthCode=abc&next=https%3A%2F%2Fevil.example&redirectTo=https%3A%2F%2Fevil.example',
      { redirect: 'manual' },
    );
    expect(response.headers.get('Location')).toBe('feedsmith://auth?convexAuthCode=abc');
  });
});
