import { useSignInWithGoogle } from '@convex-dev/auth/methods/google/react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexReactClient, useConvexAuth } from 'convex/react';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { useState, type ReactNode } from 'react';

import { api } from '../../convex/_generated/api';
import { APP_RETURN } from '../../convex/lib/appReturn';
import { AuthContext, type Auth } from '@/auth/auth-context';
import { signInOutcome, type SignInView } from '@/auth/sign-in-outcome';

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
  const [view, setView] = useState<SignInView>({ status: 'idle' });

  const auth: Auth = {
    session: isLoading ? 'loading' : isAuthenticated ? 'signed-in' : 'signed-out',
    signIn: view,
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
      setView(signInOutcome(await signIn({ code })));
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
