import { vGoogleProfile } from '@convex-dev/auth/methods/google/server';
import { ConvexError, v } from 'convex/values';

import { internalMutation } from './_generated/server';
import { canSignUp } from './lib/signUp';

/** Convex Auth calls this the first time a Google account signs in. */
export const createUserGoogle = internalMutation({
  args: { method: v.object({ name: v.literal('google'), profile: vGoogleProfile }) },
  handler: async (ctx, { method: { profile } }) => {
    if (!canSignUp(profile, process.env.AUTH_ALLOWED_EMAILS)) throw new ConvexError('NOT_ALLOWED');
    return await ctx.db.insert('users', { email: profile.email!.trim().toLowerCase(), name: profile.name });
  },
});
