import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';

import { MotionConfig } from '@/environment/motion-config';
import type { ThemeName } from '@/theme/tokens';

/** What the app's look depends on, outside the app's own data. */
export type Environment = {
  colorScheme: ThemeName;
  /** Android's "Remove animations": later slices drop expressive motion when true (Q17). */
  reduceMotion: boolean;
  /** Multiplies the type scale. 1 in the app, where Android's own font size applies on top. */
  fontScale: number;
};

const EnvironmentContext = createContext<Environment | null>(null);

export function useEnvironment(): Environment {
  const environment = use(EnvironmentContext);
  if (!environment) throw new Error('useEnvironment needs an <EnvironmentProvider> above it');
  return environment;
}

function useSystemReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}

function SystemEnvironment({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const reduceMotion = useSystemReduceMotion();
  // Dark is designed first (D3), so it's the fallback when the phone doesn't say.
  const environment: Environment = { colorScheme: scheme === 'light' ? 'light' : 'dark', reduceMotion, fontScale: 1 };
  return <Provide environment={environment}>{children}</Provide>;
}

function Provide({ environment, children }: { environment: Environment; children: ReactNode }) {
  return (
    <EnvironmentContext value={environment}>
      <MotionConfig reduceMotion={environment.reduceMotion} />
      {children}
    </EnvironmentContext>
  );
}

/**
 * Provides the environment: the phone's by default, or a fixed one from a world
 * (tests and the state gallery).
 */
export function EnvironmentProvider({ environment, children }: { environment?: Environment; children: ReactNode }) {
  if (environment) return <Provide environment={environment}>{children}</Provide>;
  return <SystemEnvironment>{children}</SystemEnvironment>;
}
