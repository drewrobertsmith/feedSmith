import { useSignInWithGoogle } from '@convex-dev/auth/methods/google/react';
import { ConvexAuthProvider, useAuthActions } from '@convex-dev/auth/react';
import { ConvexReactClient, useConvexAuth, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState, type ReactNode } from 'react';

import { api } from '../../convex/_generated/api';
import { APP_RETURN } from '../../convex/lib/appReturn';
import { AUTH_ERRORS } from '../../convex/lib/authErrors';
import { AuthContext, type Auth } from '@/auth/auth-context';
import { signInOutcome, type SignInView } from '@/auth/sign-in-outcome';
import { identify } from '@/monitoring/identify';
import { trail } from '@/monitoring/trail';

/**
 * Convex Auth accepts only http(s) return addresses, so Google returns to this
 * deployment's site, which forwards to the app's return link (convex/http.ts).
 */
const SIGN_IN_FORWARDER = `${process.env.EXPO_PUBLIC_CONVEX_SITE_URL}/auth/app`;

/** Session tokens live in the phone's secure storage, never in plain storage (Q11). */
const secureStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

function ConvexAuthBridge({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useSignInWithGoogle(api.auth);
  const { signOut } = useAuthActions();
  const account = useQuery(api.users.viewer, isAuthenticated ? {} : 'skip');
  const [view, setView] = useState<SignInView>({ status: 'idle' });
  const [signingOut, setSigningOut] = useState(false);
  const deleteOnServer = useMutation(api.account.deleteAccount);
  const [deletion, setDeletion] = useState<Auth['deletion']>('idle');

  // Crash reports name the signed-in User by their opaque id only, and no one once signed out (T50).
  const userId = isAuthenticated ? account?.id : undefined;
  useEffect(() => {
    if (userId !== undefined) identify(userId);
    else if (!isLoading && !isAuthenticated) identify(null);
  }, [userId, isLoading, isAuthenticated]);

  const auth: Auth = {
    session: isLoading ? 'loading' : isAuthenticated ? 'signed-in' : 'signed-out',
    account: isAuthenticated ? (account ?? null) : null,
    signIn: view,
    // Convex Auth revokes the session on the server, and clears the tokens from SecureStore
    // whether or not that call reached it, so the phone always signs out (Q26).
    signOut: async () => {
      setSigningOut(true);
      trail('auth.signed-out');
      // It already swallows a failed server call; the catch only keeps the busy state from sticking.
      await signOut().catch(() => null);
      setSigningOut(false);
    },
    signingOut,
    deleteAccount: async () => {
      setDeletion('deleting');
      trail('account.deletion-started');
      const deleted = await deleteOnServer({}).then(
        () => true,
        // Already gone counts as deleted; anything else (no connection, a server error) leaves it all intact.
        (error: unknown) => error instanceof ConvexError && error.data === AUTH_ERRORS.accountGone,
      );
      trail('account.deleted', { outcome: deleted ? 'ok' : 'failed' });
      if (!deleted) return setDeletion('failed');
      identify(null);
      // The server has revoked every session; this clears the tokens on the phone (Q26).
      await signOut().catch(() => null);
      setDeletion('idle');
    },
    deletion,
    startSignIn: async () => {
      setView({ status: 'busy' });
      const start = await signIn({ redirectTo: SIGN_IN_FORWARDER });
      if (start.status !== 'redirect') return setView(signInOutcome(start));
      const browser = await WebBrowser.openAuthSessionAsync(start.redirect.toString(), APP_RETURN);
      // On success the return link reaches the auth route, which finishes sign-in.
      if (browser.type !== 'success') setView({ status: 'idle' });
    },
    completeSignIn: async ({ code, error }) => {
      if (error !== undefined) return setView(signInOutcome({ status: 'error', userError: { error } }));
      if (code === undefined) return;
      setView({ status: 'busy' });
      const result = await signIn({ code });
      trail('auth.signed-in', { outcome: result.status === 'complete' ? 'ok' : 'failed' });
      setView(signInOutcome(result));
    },
  };

  return <AuthContext value={auth}>{children}</AuthContext>;
}

/** The app's auth: Convex Auth with Google, on the deployment named by the build. */
export function ConvexAuth({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, { unsavedChangesWarning: false }),
  );
  return (
    <ConvexAuthProvider
      client={client}
      storage={secureStorage}
      api={{ refreshSession: api.auth.refreshSession, signOut: api.auth.signOut, isAuthenticated: api.auth.isAuthenticated }}
    >
      <ConvexAuthBridge>{children}</ConvexAuthBridge>
    </ConvexAuthProvider>
  );
}
