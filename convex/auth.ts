import { setupGoogle } from '@convex-dev/auth/methods/google/server';
import { setupConvexAuth } from '@convex-dev/auth/server';

import { components, internal } from './_generated/api';

const auth = setupConvexAuth({ component: components.auth });
export const { signOut, refreshSession, isAuthenticated } = auth;

// Convex Auth accepts only http(s) return addresses, so Google sends the user back
// to this deployment's own site, and http.ts forwards the code into the app.
export const { startSignInWithGoogle, completeSignInWithGoogle } = setupGoogle(auth, {
  component: components.authGoogle,
  allowedRedirectOrigins: [process.env.CONVEX_SITE_URL!],
}).attachUserCallbacks({ createUser: internal.users.createUserGoogle });
