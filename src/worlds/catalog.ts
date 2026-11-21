import type { CatalogWorld } from '@/worlds/world';

/** The app shell's worlds (FEE-18): the states a change to the shell is most likely to break. */
export const SHELL_WORLDS = [
  { id: 'dark', label: 'Dark, Feeds', spec: { colorScheme: 'dark' } },
  { id: 'light', label: 'Light, Feeds', spec: { colorScheme: 'light' } },
  { id: 'dark-saved', label: 'Dark, Saved', spec: { colorScheme: 'dark', section: 'saved' } },
  { id: 'light-saved', label: 'Light, Saved', spec: { colorScheme: 'light', section: 'saved' } },
  { id: 'largest-font', label: 'Largest font size', spec: { colorScheme: 'dark', fontScale: 2 } },
  { id: 'remove-animations', label: 'Remove animations', spec: { colorScheme: 'dark', reduceMotion: true } },
] as const satisfies readonly CatalogWorld[];

export type ShellWorldId = (typeof SHELL_WORLDS)[number]['id'];
