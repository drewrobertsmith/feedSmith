import { setupGoogle } from '@convex-dev/auth/methods/google/server';
import { setupConvexAuth } from '@convex-dev/auth/server';

import { components, internal } from './_generated/api';

const DAY = 24 * 60 * 60;

// Sessions time out: access tokens last a minute, and a User signs in again after
// 30 days, or sooner if the app goes unused for 30 days (Convex Auth's defaults, stated).
const auth = setupConvexAuth({
  component: components.auth,
  accessTokenTtlSeconds: 60,
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
