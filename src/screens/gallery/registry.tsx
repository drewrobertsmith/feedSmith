import type { ReactElement } from 'react';

import { FeedsScreen } from '@/screens/feeds-screen';
import { ReadingScreen } from '@/screens/reading/reading-screen';
import { SignInScreen } from '@/screens/sign-in/sign-in-screen';
import {
  ACCOUNT_WORLDS,
  ADD_FEED_WORLDS,
  ALL_WORLDS,
  READING_WORLDS,
  SHELL_WORLDS,
  SIGN_IN_WORLDS,
} from '@/worlds/catalog';
import { FIXTURE_ROWS } from '@/worlds/fixtures';
import type { CatalogWorld, WorldSpec } from '@/worlds/world';

export type GalleryEntry = {
  screen: string;
  worlds: readonly CatalogWorld[];
  /** Renders the real screen; the world's environment is provided around it. */
  render: (spec: WorldSpec) => ReactElement;
};

/** Every screen in the state gallery. Each UI ticket adds its screen and worlds here (T13). */
export const GALLERY: readonly GalleryEntry[] = [
  {
    screen: 'Shell',
    worlds: SHELL_WORLDS,
    render: () => <FeedsScreen />,
  },
  {
    screen: 'Sign in',
    worlds: SIGN_IN_WORLDS,
    render: () => <SignInScreen />,
  },
  { screen: 'All', worlds: ALL_WORLDS, render: (spec) => <FeedsScreen feed={spec.feed} menuFor={spec.chipMenu} /> },
  // The add sheet over Feeds, open (FEE-45).
  { screen: 'Add a Feed', worlds: ADD_FEED_WORLDS, render: (spec) => <FeedsScreen feed={spec.feed} addOpen /> },
  { screen: 'Reading view', worlds: READING_WORLDS, render: () => <ReadingScreen id={FIXTURE_ROWS[0].id} /> },
  {
    screen: 'Account',
    worlds: ACCOUNT_WORLDS,
    render: (spec) => <FeedsScreen accountOpen={spec.accountSheet === 'open'} />,
  },
];
