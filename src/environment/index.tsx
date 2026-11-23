import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, useColorScheme, useWindowDimensions } from 'react-native';

import { MotionConfig } from '@/environment/motion-config';
import type { ThemeName } from '@/theme/tokens';

/** What the app's look depends on, outside the app's own data. */
export type Environment = {
  colorScheme: ThemeName;
  /** Android's "Remove animations": later slices drop expressive motion when true (Q17). */
  reduceMotion: boolean;
  /** Multiplies the type scale. 1 in the app, where Android's own font size applies on top. */
  fontScale: number;
  /** The clock: the phone's in the app, a fixed time in a world, so "2 hr. ago" can be tested. */
  now: () => number;
};

const EnvironmentContext = createContext<Environment | null>(null);

export function useEnvironment(): Environment {
  const environment = use(EnvironmentContext);
  if (!environment) throw new Error('useEnvironment needs an <EnvironmentProvider> above it');
  return environment;
}

/**
 * How much a non-text size (an icon, the tile behind an initial) grows with the type: the
 * world's font scale times Android's font size setting. Text gets Android's setting on its own;
 * anything sized beside it has to ask, or text outgrows it and clips (Q16).
 */
export function useSizeScale(): number {
  const { fontScale } = useEnvironment();
  const { fontScale: system } = useWindowDimensions();
  return fontScale * system;
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
  const environment: Environment = {
    colorScheme: scheme === 'light' ? 'light' : 'dark',
    reduceMotion,
    fontScale: 1,
    now: Date.now,
  };
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
