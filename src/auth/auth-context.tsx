import { createContext, use } from 'react';

import type { SignInView } from '@/auth/sign-in-outcome';

/** Who is signed in, as the account circle and sheet show them (P17). */
export type Account = {
  /** Absent when Google gave no name; the email stands in. */
  name?: string;
  email: string;
  /** The circle's letter. */
  initial: string;
};

/**
 * Everything the app knows about signing in. Convex Auth backs it in the app
 * (`ConvexAuth`); a world gives a fixed one in tests and the state gallery.
 */
export type Auth = {
  session: 'loading' | 'signed-out' | 'signed-in';
  /** The signed-in User's Account; `null` until it loads, and when signed out. */
  account: Account | null;
  signIn: SignInView;
  /**
   * Ends the session on the server and clears its tokens from the phone. The phone signs out
   * even when the server can't be reached (P17, Q26).
   */
  signOut: () => Promise<void>;
  /** Whether a sign-out is under way. */
  signingOut: boolean;
  /**
   * Deletes the Account for good, then signs out (P18). If it doesn't reach the server, nothing
   * is deleted, the User stays signed in, and `deletion` says it failed.
   */
  deleteAccount: () => Promise<void>;
  /** Where deleting the Account is up to. */
  deletion: 'idle' | 'deleting' | 'failed';
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
