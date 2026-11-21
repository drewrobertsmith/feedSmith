import { Stack } from 'expo-router';
import { DarkTheme, DefaultTheme, ThemeProvider, type Theme } from 'expo-router/react-navigation';
import { StatusBar } from 'expo-status-bar';

import { EnvironmentProvider, useEnvironment, type Environment } from '@/environment';
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

  return (
    <ThemeProvider value={navigationTheme(colorScheme)}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        {/* The state gallery exists only in development builds (T13). */}
        <Stack.Protected guard={__DEV__}>
          <Stack.Screen name="gallery" />
          <Stack.Screen name="spike-auth" />
        </Stack.Protected>
        <Stack.Screen name="auth" />
      </Stack>
    </ThemeProvider>
  );
}

/** The app's providers and root stack. A world passes its environment; the app uses the phone's. */
export function AppRoot({ environment }: { environment?: Environment }) {
  return (
    <EnvironmentProvider environment={environment}>
      <ThemedStack />
    </EnvironmentProvider>
  );
}
