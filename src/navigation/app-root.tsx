import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DarkTheme, DefaultTheme, ThemeProvider, type Theme } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';

import { AuthContext, useAuth, type Auth } from '@/auth/auth-context';
import { UndoProvider } from '@/components/undo-toast';
import { ConvexAuth } from '@/auth/convex-auth';
import { EnvironmentProvider, useEnvironment, type Environment } from '@/environment';
import { ConvexFeeds } from '@/feeds/convex-feeds';
import { FeedsContext, type FeedsData } from '@/feeds/feeds-data';
import { themes, type ThemeName } from '@/theme/tokens';

function navigationTheme(scheme: ThemeName): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const theme = themes[scheme];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: theme.accent,
      background: theme.background,
      card: theme.background,
      text: theme.text,
      border: theme.decor,
      notification: theme.accent,
    },
  };
}

function ThemedStack() {
  const { colorScheme } = useEnvironment();
  const { session } = useAuth();

  return (
    <ThemeProvider value={navigationTheme(colorScheme)}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      {/* Nothing until the stored session is read, so a signed-in User never sees sign-in flash. */}
      {session === 'loading' ? null : (
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Protected guard={session === 'signed-in'}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="article/[id]" />
            <Stack.Screen name="manage-feeds" />
          </Stack.Protected>
          <Stack.Protected guard={session === 'signed-out'}>
            <Stack.Screen name="sign-in" />
          </Stack.Protected>
          {/* The sign-in return link (feedsmith://auth), reachable signed in or out. */}
          <Stack.Screen name="auth" />
          {/* The state gallery exists only in development builds (T13). */}
          <Stack.Protected guard={__DEV__}>
            <Stack.Screen name="gallery" />
          </Stack.Protected>
        </Stack>
      )}
    </ThemeProvider>
  );
}

/**
 * The app's providers and root stack. A world passes its environment, auth and Feeds; the
 * app uses the phone's environment, Convex Auth and Convex.
 */
export function AppRoot({ environment, auth, feeds }: { environment?: Environment; auth?: Auth; feeds?: FeedsData }) {
  const stack = (
    // Gestures (dragging Pinned Feeds, D13) need a root that sees every touch.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <EnvironmentProvider environment={environment}>
        {/* One Undo note at a time, across screens: Done in the Reading view shows it in Saved (Q35). */}
        <UndoProvider>
          <ThemedStack />
        </UndoProvider>
      </EnvironmentProvider>
    </GestureHandlerRootView>
  );
  if (auth && feeds) {
    return (
      <AuthContext value={auth}>
        <FeedsContext value={feeds}>{stack}</FeedsContext>
      </AuthContext>
    );
  }
  return (
    <ConvexAuth>
      <ConvexFeeds>{stack}</ConvexFeeds>
    </ConvexAuth>
  );
}
