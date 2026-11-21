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

/** The sign-in screen's worlds (FEE-21). */
export const SIGN_IN_WORLDS = [
  { id: 'signed-out-dark', label: 'Signed out, dark', spec: { colorScheme: 'dark', auth: 'signed-out' } },
  { id: 'signed-out-light', label: 'Signed out, light', spec: { colorScheme: 'light', auth: 'signed-out' } },
  { id: 'signing-in', label: 'Signing in', spec: { colorScheme: 'dark', auth: 'signing-in' } },
  { id: 'not-allowed', label: 'Not on the allowlist', spec: { colorScheme: 'dark', auth: 'not-allowed' } },
  { id: 'failed', label: 'Sign-in failed', spec: { colorScheme: 'dark', auth: 'failed' } },
  {
    id: 'sign-in-largest-font',
    label: 'Sign in, largest font size',
    spec: { colorScheme: 'dark', auth: 'signed-out', fontScale: 2 },
  },
  {
    id: 'sign-in-remove-animations',
    label: 'Sign in, Remove animations',
    spec: { colorScheme: 'dark', auth: 'signed-out', reduceMotion: true },
  },
] as const satisfies readonly CatalogWorld[];

export type SignInWorldId = (typeof SIGN_IN_WORLDS)[number]['id'];

/** All, on the Feeds screen (FEE-23). */
export const ALL_WORLDS = [
  { id: 'all-dark', label: 'All, dark', spec: { colorScheme: 'dark', feeds: 'some' } },
  { id: 'all-light', label: 'All, light', spec: { colorScheme: 'light', feeds: 'some' } },
  { id: 'all-empty', label: 'No Feeds yet', spec: { colorScheme: 'dark', feeds: 'none' } },
  { id: 'all-loading', label: 'All, loading', spec: { colorScheme: 'dark', feeds: 'loading' } },
  { id: 'all-largest-font', label: 'All, largest font size', spec: { colorScheme: 'dark', feeds: 'some', fontScale: 2 } },
] as const satisfies readonly CatalogWorld[];

export type AllWorldId = (typeof ALL_WORLDS)[number]['id'];

/** Adding a Feed (FEE-23). */
export const ADD_FEED_WORLDS = [
  { id: 'add-idle', label: 'Add a Feed', spec: { colorScheme: 'dark', section: 'add-feed' } },
  { id: 'add-busy', label: 'Adding', spec: { colorScheme: 'dark', section: 'add-feed', addFeed: 'busy' } },
  { id: 'add-not-a-feed', label: 'Not a feed', spec: { colorScheme: 'dark', section: 'add-feed', addFeed: 'not-a-feed' } },
  { id: 'add-unreachable', label: 'Unreachable', spec: { colorScheme: 'light', section: 'add-feed', addFeed: 'unreachable' } },
  {
    id: 'add-largest-font',
    label: 'Add a Feed, largest font size',
    spec: { colorScheme: 'dark', section: 'add-feed', addFeed: 'invalid-url', fontScale: 2 },
  },
] as const satisfies readonly CatalogWorld[];

export type AddFeedWorldId = (typeof ADD_FEED_WORLDS)[number]['id'];

/** The Reading view (FEE-23). */
export const READING_WORLDS = [
  { id: 'reading-dark', label: 'Reading, dark', spec: { colorScheme: 'dark', section: 'article' } },
  { id: 'reading-light', label: 'Reading, light', spec: { colorScheme: 'light', section: 'article' } },
  { id: 'reading-omitted', label: 'A video and a table left out', spec: { colorScheme: 'dark', section: 'article', article: 'omitted' } },
  { id: 'reading-missing', label: 'Article not available', spec: { colorScheme: 'dark', section: 'article', article: 'missing' } },
  {
    id: 'reading-largest-font',
    label: 'Reading, largest font size',
    spec: { colorScheme: 'dark', section: 'article', fontScale: 2 },
  },
] as const satisfies readonly CatalogWorld[];

export type ReadingWorldId = (typeof READING_WORLDS)[number]['id'];
