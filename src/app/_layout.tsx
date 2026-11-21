import '@/global.css';

import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { ConvexReactClient } from 'convex/react';
import * as SecureStore from 'expo-secure-store';

import { api } from '../../convex/_generated/api';
import { AppRoot } from '@/navigation/app-root';

// SPIKE (FEE-21): provider wiring to prove sign-in; moves behind a tested seam after.
const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!, { unsavedChangesWarning: false });
const secureStorage = {
  getItem: SecureStore.getItemAsync,
  setItem: SecureStore.setItemAsync,
  removeItem: SecureStore.deleteItemAsync,
};

export default function RootLayout() {
  return (
    <ConvexAuthProvider
      client={convex}
      storage={secureStorage}
      api={{ refreshSession: api.auth.refreshSession, signOut: api.auth.signOut, isAuthenticated: api.auth.isAuthenticated }}
    >
      <AppRoot />
    </ConvexAuthProvider>
  );
}
