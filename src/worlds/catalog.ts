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
