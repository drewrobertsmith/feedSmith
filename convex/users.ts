import { getAuthUserId } from '@convex-dev/auth/server';
import { v } from 'convex/values';

import { internalMutation, query } from './_generated/server';

// SPIKE (FEE-21): proves the native sign-in round trip. Replaced test-first after.
export const createUserGoogle = internalMutation({
  args: {
    method: v.object({
      name: v.literal('google'),
      profile: v.object({
        id: v.string(),
        email: v.optional(v.string()),
        emailVerified: v.boolean(),
        name: v.optional(v.string()),
        picture: v.optional(v.string()),
      }),
    }),
  },
  handler: async (ctx, { method: { profile } }) => {
    const allowed = (process.env.AUTH_ALLOWED_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const email = profile.email?.toLowerCase();
    if (!email || !profile.emailVerified || !allowed.includes(email)) {
      throw new Error('This Google account is not allowed to sign up.');
    }
    return await ctx.db.insert('users', { email, name: profile.name });
  },
});

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    const user = await ctx.db.get(userId);
    return user ? { email: user.email } : null;
  },
});
