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
  { id: 'all-read', label: 'All, everything Read', spec: { colorScheme: 'dark', feeds: 'read' } },
  { id: 'all-empty', label: 'No Feeds yet', spec: { colorScheme: 'dark', feeds: 'none' } },
  { id: 'all-loading', label: 'All, loading', spec: { colorScheme: 'dark', feeds: 'loading' } },
  { id: 'all-refreshing', label: 'All, refreshing', spec: { colorScheme: 'light', feeds: 'some', refreshing: true } },
  { id: 'all-largest-font', label: 'All, largest font size', spec: { colorScheme: 'dark', feeds: 'some', fontScale: 2 } },
  { id: 'all-feed', label: 'One Feed chosen', spec: { colorScheme: 'dark', feeds: 'some', feed: 'f1' } },
  { id: 'all-feed-light', label: 'One Feed chosen, light', spec: { colorScheme: 'light', feeds: 'some', feed: 'f2' } },
  { id: 'all-feed-empty', label: 'A Feed with nothing new', spec: { colorScheme: 'dark', feeds: 'some', feed: 'f3' } },
  { id: 'all-many-feeds', label: 'Many Feeds, one long name', spec: { colorScheme: 'dark', feeds: 'some', chips: 'many' } },
  {
    id: 'all-many-feeds-largest-font',
    label: 'Many Feeds, largest font size',
    spec: { colorScheme: 'light', feeds: 'some', chips: 'many', fontScale: 2 },
  },
  {
    id: 'all-remove-animations',
    label: 'All, Remove animations',
    spec: { colorScheme: 'dark', feeds: 'some', reduceMotion: true },
  },
] as const satisfies readonly CatalogWorld[];

export type AllWorldId = (typeof ALL_WORLDS)[number]['id'];

/** Adding a Feed (FEE-23). */
export const ADD_FEED_WORLDS = [
  { id: 'add-idle', label: 'Add a Feed', spec: { colorScheme: 'dark', section: 'add-feed' } },
  { id: 'add-busy', label: 'Adding', spec: { colorScheme: 'dark', section: 'add-feed', addFeed: 'busy' } },
  { id: 'add-choose', label: 'Choose a feed', spec: { colorScheme: 'dark', section: 'add-feed', addFeed: 'choose' } },
  { id: 'add-no-feed', label: 'No feed found', spec: { colorScheme: 'light', section: 'add-feed', addFeed: 'no-feed-found' } },
  { id: 'add-not-a-feed', label: 'Not a feed', spec: { colorScheme: 'dark', section: 'add-feed', addFeed: 'not-a-feed' } },
  { id: 'add-unreachable', label: 'Unreachable', spec: { colorScheme: 'light', section: 'add-feed', addFeed: 'unreachable' } },
  {
    id: 'add-largest-font',
    label: 'Add a Feed, largest font size',
    spec: { colorScheme: 'dark', section: 'add-feed', addFeed: 'choose', fontScale: 2 },
  },
] as const satisfies readonly CatalogWorld[];

export type AddFeedWorldId = (typeof ADD_FEED_WORLDS)[number]['id'];

/** The Reading view (FEE-23). */
export const READING_WORLDS = [
  { id: 'reading-dark', label: 'Reading, dark', spec: { colorScheme: 'dark', section: 'article' } },
  { id: 'reading-light', label: 'Reading, light', spec: { colorScheme: 'light', section: 'article' } },
  { id: 'reading-no-lead-image', label: 'No lead image', spec: { colorScheme: 'dark', section: 'article', article: 'no-lead-image' } },
  {
    id: 'reading-long-feed-name',
    label: 'A long Feed name',
    spec: { colorScheme: 'light', section: 'article', article: 'long-feed-name' },
  },
  { id: 'reading-several-authors', label: 'Four authors', spec: { colorScheme: 'dark', section: 'article', article: 'several-authors' } },
  { id: 'reading-no-author', label: 'No author', spec: { colorScheme: 'light', section: 'article', article: 'no-author' } },
  { id: 'reading-omitted', label: 'A video and a table left out', spec: { colorScheme: 'dark', section: 'article', article: 'omitted' } },
  { id: 'reading-missing', label: 'Article not available', spec: { colorScheme: 'dark', section: 'article', article: 'missing' } },
  { id: 'reading-extracting', label: 'Bringing in from the page', spec: { colorScheme: 'dark', section: 'article', article: 'extracting' } },
  { id: 'reading-unextracted', label: "Page couldn't be read", spec: { colorScheme: 'dark', section: 'article', article: 'unextracted' } },
  {
    id: 'reading-unextracted-no-image',
    label: "Page couldn't be read, no image",
    spec: { colorScheme: 'dark', section: 'article', article: 'unextracted-no-image' },
  },
  {
    id: 'reading-unextracted-light',
    label: "Page couldn't be read, light",
    spec: { colorScheme: 'light', section: 'article', article: 'unextracted' },
  },
  {
    id: 'reading-unextracted-largest-font',
    label: "Page couldn't be read, largest font",
    spec: { colorScheme: 'dark', section: 'article', article: 'unextracted', fontScale: 2 },
  },
  {
    id: 'reading-largest-font',
    label: 'Reading, largest font size',
    spec: { colorScheme: 'dark', section: 'article', fontScale: 2 },
  },
] as const satisfies readonly CatalogWorld[];

export type ReadingWorldId = (typeof READING_WORLDS)[number]['id'];

/** Manage Feeds (FEE-31, D13). */
export const MANAGE_WORLDS = [
  { id: 'manage-dark', label: 'Manage Feeds, dark', spec: { colorScheme: 'dark', section: 'manage' } },
  { id: 'manage-light', label: 'Manage Feeds, light', spec: { colorScheme: 'light', section: 'manage' } },
  { id: 'manage-pinned', label: 'Three Pinned to order', spec: { colorScheme: 'dark', section: 'manage', manage: 'pinned' } },
  { id: 'manage-empty', label: 'No Feeds to manage', spec: { colorScheme: 'dark', section: 'manage', manage: 'none' } },
  { id: 'manage-loading', label: 'Manage Feeds, loading', spec: { colorScheme: 'dark', section: 'manage', manage: 'loading' } },
  {
    id: 'manage-largest-font',
    label: 'Manage Feeds, largest font size',
    spec: { colorScheme: 'dark', section: 'manage', manage: 'pinned', fontScale: 2 },
  },
] as const satisfies readonly CatalogWorld[];

export type ManageWorldId = (typeof MANAGE_WORLDS)[number]['id'];

/** The account circle and the Account sheet (FEE-35, P17, D17). */
export const ACCOUNT_WORLDS = [
  { id: 'account-circle-dark', label: 'Account circle, dark', spec: { colorScheme: 'dark', feeds: 'some' } },
  { id: 'account-circle-light', label: 'Account circle, light', spec: { colorScheme: 'light', section: 'saved' } },
  { id: 'account-sheet', label: 'Account sheet', spec: { colorScheme: 'dark', feeds: 'some', accountSheet: 'open' } },
  {
    id: 'account-signing-out',
    label: 'Signing out',
    spec: { colorScheme: 'dark', feeds: 'some', accountSheet: 'open', signOut: 'busy' },
  },
  {
    id: 'account-no-server',
    label: 'Sign out with no server',
    spec: { colorScheme: 'dark', section: 'saved', accountSheet: 'open', signOut: 'no-server' },
  },
  {
    id: 'account-no-name',
    label: 'No name from Google',
    spec: { colorScheme: 'light', feeds: 'some', accountSheet: 'open', account: 'no-name' },
  },
  {
    id: 'account-largest-font',
    label: 'Account sheet, largest font size',
    spec: { colorScheme: 'dark', feeds: 'some', accountSheet: 'open', fontScale: 2 },
  },
  {
    id: 'account-remove-animations',
    label: 'Account sheet, Remove animations',
    spec: { colorScheme: 'dark', feeds: 'some', accountSheet: 'open', reduceMotion: true },
  },
] as const satisfies readonly CatalogWorld[];

export type AccountWorldId = (typeof ACCOUNT_WORLDS)[number]['id'];
