import { vGoogleProfile } from '@convex-dev/auth/methods/google/server';
import { ConvexError, v } from 'convex/values';

import { internalMutation } from './_generated/server';
import { AUTH_ERRORS } from './lib/authErrors';
import { allowedSignUpEmail } from './lib/signUp';

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
