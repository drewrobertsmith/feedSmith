import { createContext, use } from 'react';

import type { SignInView } from '@/auth/sign-in-outcome';

/**
 * Everything the app knows about signing in. Convex Auth backs it in the app
 * (`ConvexAuth`); a world gives a fixed one in tests and the state gallery.
 */
export type Auth = {
  session: 'loading' | 'signed-out' | 'signed-in';
  signIn: SignInView;
  /** Opens Google's sign-in in an in-app browser. */
  startSignIn: () => void;
  /** Finishes sign-in with what the return link (`feedsmith://auth`) carried. */
  completeSignIn: (link: { code?: string; error?: string }) => void;
};

export const AuthContext = createContext<Auth | null>(null);

export function useAuth(): Auth {
  const auth = use(AuthContext);
  if (!auth) throw new Error('useAuth needs an auth provider above it');
  return auth;
}
