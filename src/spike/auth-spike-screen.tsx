// SPIKE (FEE-21): proves Google sign-in round-trips through feedsmith:// on Android.
// Throwaway: replaced by the real sign-in screen, test-first, once this works.
import { useConvexAuth, useQuery } from 'convex/react';
import { useSignInWithGoogle } from '@convex-dev/auth/methods/google/react';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { api } from '../../convex/_generated/api';
import { AppText } from '@/components/app-text';

const RETURN_TO = `${process.env.EXPO_PUBLIC_CONVEX_SITE_URL}/auth/app`;

export function AuthSpikeScreen() {
  const { signIn } = useSignInWithGoogle(api.auth);
  const { isAuthenticated, isLoading } = useConvexAuth();
  const viewer = useQuery(api.users.viewer);
  const [log, setLog] = useState<string[]>([]);
  const note = (line: string) => setLog((l) => [...l, line]);

  async function run() {
    const start = await signIn({ redirectTo: RETURN_TO });
    note(`start: ${start.status}`);
    if (start.status !== 'redirect') return;
    const result = await WebBrowser.openAuthSessionAsync(start.redirect.toString(), 'feedsmith://auth');
    note(`browser: ${result.type}`);
    if (result.type !== 'success') return;
    note(`url: ${result.url.replace(/(convexAuthCode=)[^&]+/, '$1***')}`);
    const params = new URL(result.url).searchParams;
    const code = params.get('convexAuthCode');
    note(`returned: code=${code ? 'yes' : 'no'} error=${params.get('convexAuthError') ?? '-'}`);
    if (!code) return;
    const done = await signIn({ code });
    note(`complete: ${JSON.stringify(done).slice(0, 120)}`);
  }

  return (
    <View className="flex-1 gap-related bg-background px-edge pt-section">
      <AppText variant="title">Auth spike</AppText>
      <AppText variant="label">{`loading=${isLoading} signedIn=${isAuthenticated} viewer=${viewer?.email ?? 'none'}`}</AppText>
      <Pressable role="button" aria-label="Sign in with Google" onPress={run} className="rounded-full bg-indicator px-group py-related">
        <AppText variant="label" className="text-accent">Sign in with Google</AppText>
      </Pressable>
      {log.map((line, i) => (
        <AppText key={i} variant="label" className="text-text-muted">{line}</AppText>
      ))}
    </View>
  );
}
