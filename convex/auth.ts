import { setupGoogle } from '@convex-dev/auth/methods/google/server';
import { setupConvexAuth } from '@convex-dev/auth/server';

import { components, internal } from './_generated/api';

const DAY = 24 * 60 * 60;

// Sessions time out: a User signs in again after 30 days, or sooner if the app goes unused for
// 30 days. Access tokens last 15 minutes (T26): every function looks the session up on each call
// (getAuthUserId), so signing out or deleting an Account still takes effect at once, and the app
// refreshes its token about four times an hour instead of sixty, re-running every live query each time.
const auth = setupConvexAuth({
  component: components.auth,
  accessTokenTtlSeconds: 15 * 60,
  sessionMaxLifetimeSeconds: 30 * DAY,
  refreshInactivityTimeoutSeconds: 30 * DAY,
});
export const { signOut, refreshSession, isAuthenticated } = auth;

// Convex Auth accepts only http(s) return addresses, so Google sends the user back
// to this deployment's own site, and http.ts forwards the code into the app.
export const { startSignInWithGoogle, completeSignInWithGoogle } = setupGoogle(auth, {
  component: components.authGoogle,
  allowedRedirectOrigins: [process.env.CONVEX_SITE_URL!],
}).attachUserCallbacks({ createUser: internal.users.createUserGoogle });
