/// <reference types="vite/client" />
import { convexTest } from 'convex-test';
import { describe, expect, test, vi } from 'vitest';

import { api } from './_generated/api';
import { accountInitial } from './lib/account';
import schema from './schema';

// As in auth.test.ts: the test identity's subject is the user id.
vi.mock('@convex-dev/auth/server', async (original) => ({
  ...(await original<typeof import('@convex-dev/auth/server')>()),
  getAuthUserId: async (ctx: { auth: { getUserIdentity: () => Promise<{ subject: string } | null> } }) =>
    (await ctx.auth.getUserIdentity())?.subject ?? null,
}));

const modules = import.meta.glob('./**/*.ts');

async function setup() {
  const t = convexTest(schema, modules);
  const [a, b] = await t.run(async (ctx) => [
    await ctx.db.insert('users', { email: 'ada@example.com', name: 'Ada Lovelace' }),
    await ctx.db.insert('users', { email: 'brian@example.com' }),
  ]);
  return { t, aId: a, bId: b, a: t.withIdentity({ subject: a }), b: t.withIdentity({ subject: b }) };
}

describe('viewer (P17)', () => {
  test('a signed-out caller gets nothing (Q10)', async () => {
    const { t } = await setup();
    expect(await t.query(api.users.viewer, {})).toBeNull();
  });

  // FEE-138 (T50): the opaque id is what crash reports carry, so a phone crash can be matched to the server's logs.
  test('a signed-in User gets their own id, name, email and initial', async () => {
    const { a, aId } = await setup();
    expect(await a.query(api.users.viewer, {})).toEqual({ id: aId, name: 'Ada Lovelace', email: 'ada@example.com', initial: 'A' });
  });

  test("with no name from Google, the initial is the email's first letter", async () => {
    const { b, bId } = await setup();
    expect(await b.query(api.users.viewer, {})).toEqual({ id: bId, email: 'brian@example.com', initial: 'B' });
  });

  test("User B never gets User A's Account, even by asking for it (Q10)", async () => {
    const { t, b } = await setup();
    const aId = await t.run(async (ctx) => (await ctx.db.query('users').first())!._id);
    // `viewer` takes no arguments: there is no way to name another User.
    await expect(b.query(api.users.viewer, { userId: aId } as never)).rejects.toThrow(/userId/);
    expect(await b.query(api.users.viewer, {})).not.toMatchObject({ id: aId });
    expect(await b.query(api.users.viewer, {})).toMatchObject({ email: 'brian@example.com' });
  });

  test('a session whose User is gone gets nothing', async () => {
    const { t, a } = await setup();
    await t.run(async (ctx) => {
      const user = await ctx.db.query('users').first();
      await ctx.db.delete(user!._id);
    });
    expect(await a.query(api.users.viewer, {})).toBeNull();
  });
});

describe('initial', () => {
  test.each([
    ['a name', { name: 'ada lovelace', email: 'x@example.com' }, 'A'],
    ['a name with leading spaces', { name: '  Émile', email: 'x@example.com' }, 'É'],
    ['an empty name', { name: '   ', email: 'zed@example.com' }, 'Z'],
    ['no name', { email: 'mo@example.com' }, 'M'],
    ['a name starting with an emoji', { name: '🦊 Fox', email: 'x@example.com' }, '🦊'],
  ])('from %s', (_case, user, initial) => {
    expect(accountInitial(user)).toBe(initial);
  });
});
