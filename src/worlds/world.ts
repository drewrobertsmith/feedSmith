import { Uniwind } from 'uniwind';

import type { Environment } from '@/environment';
import type { ThemeName } from '@/theme/tokens';

/**
 * One state the app can be in, as plain data (T13). Later tickets extend it with their
 * own axes (signed in or out, network, fixture Feeds…), reached through the real modules.
 */
export type WorldSpec = {
  colorScheme: ThemeName;
  reduceMotion?: boolean;
  /** Android's largest font size is 2.0. */
  fontScale?: number;
  /** The section the world opens on. */
  section?: 'feeds' | 'saved';
};

export type World = {
  /** What `<AppRoot environment>` takes. */
  environment: Environment;
  /** Where the router starts. */
  initialUrl: '/' | '/saved';
  /** Puts back what the world changed: the theme follows the phone again. */
  dispose: () => void;
};

/** The environment a world gives the app, without applying anything. */
export function worldEnvironment(spec: WorldSpec): Environment {
  return { colorScheme: spec.colorScheme, reduceMotion: spec.reduceMotion ?? false, fontScale: spec.fontScale ?? 1 };
}

export function createWorld(spec: WorldSpec): World {
  Uniwind.setTheme(spec.colorScheme);

  return {
    environment: worldEnvironment(spec),
    initialUrl: spec.section === 'saved' ? '/saved' : '/',
    dispose: () => Uniwind.setTheme('system'),
  };
}

export type CatalogWorld = { id: string; label: string; spec: WorldSpec };
