import { vGoogleProfile } from '@convex-dev/auth/methods/google/server';
import { ConvexError, v } from 'convex/values';

import { getAuthUserId } from '@convex-dev/auth/server';

import { internalMutation, query } from './_generated/server';
import { accountInitial } from './lib/account';
import { AUTH_ERRORS } from './lib/authErrors';
import { allowedSignUpEmail } from './lib/signUp';

/**
 * The signed-in User's Account, for the account circle and sheet (P17). It takes no arguments,
 * so it can only ever return the caller's own (Q10). Signed out, or with the User gone, it
 * returns nothing rather than refusing, since the app asks for it while signing out.
 */
export const viewer = query({
  args: {},
  returns: v.union(v.null(), v.object({ name: v.optional(v.string()), email: v.string(), initial: v.string() })),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    if (user === null) return null;
    const name = user.name?.trim() || undefined;
    return { ...(name ? { name } : {}), email: user.email, initial: accountInitial(user) };
  },
});

/** Convex Auth calls this the first time a Google account signs in. */
export const createUserGoogle = internalMutation({
  args: { method: v.object({ name: v.literal('google'), profile: vGoogleProfile }) },
  returns: v.id('users'),
  handler: async (ctx, { method: { profile } }) => {
    const email = allowedSignUpEmail(profile, process.env.AUTH_ALLOWED_EMAILS);
    if (email === null) throw new ConvexError(AUTH_ERRORS.notAllowed);
    return await ctx.db.insert('users', { email, name: profile.name });
  },
});
