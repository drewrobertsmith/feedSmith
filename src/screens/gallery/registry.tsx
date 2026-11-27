import type { ReactElement } from 'react';

import { FeedsScreen } from '@/screens/feeds-screen';
import { ReadingScreen } from '@/screens/reading/reading-screen';
import { SignInScreen } from '@/screens/sign-in/sign-in-screen';
import {
  ACCOUNT_WORLDS,
  ADD_FEED_WORLDS,
  ALL_WORLDS,
  NEW_ARTICLES_WORLDS,
  NEW_ADDRESS_WORLDS,
  NOT_UPDATING_WORLDS,
  READING_WORLDS,
  SHELL_WORLDS,
  SIGN_IN_WORLDS,
} from '@/worlds/catalog';
import { FIXTURE_ROWS } from '@/worlds/fixtures';
import type { StartState } from '@/navigation/start-state';
import type { CatalogWorld, WorldSpec } from '@/worlds/world';

export type GalleryEntry = {
  screen: string;
  worlds: readonly CatalogWorld[];
  /** Renders the real screen; the world's environment is provided around it. */
  render: (spec: WorldSpec) => ReactElement;
  /** Where the world starts: a sheet or a chip's menu open, or the list scrolled (FEE-105). Nothing, by default. */
  start?: (spec: WorldSpec) => StartState;
};

/** Where a scrolled-down world's list starts: past the header, a few rows in (FEE-102). */
const SCROLLED_ROW = 4;

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
  { screen: 'All', worlds: ALL_WORLDS, render: (spec) => <FeedsScreen feed={spec.feed} />, start: (spec) => ({ chipMenu: spec.chipMenu }) },
  // New Articles arriving a moment after the world opens (FEE-102): scrolled worlds start at the fifth row.
  {
    screen: 'New Articles',
    worlds: NEW_ARTICLES_WORLDS,
    render: (spec) => <FeedsScreen feed={spec.feed} />,
    start: (spec) => ({ startAtRow: spec.scrolled ? SCROLLED_ROW : undefined }),
  },
  // The add sheet over Feeds, open (FEE-45).
  { screen: 'Add a Feed', worlds: ADD_FEED_WORLDS, render: (spec) => <FeedsScreen feed={spec.feed} />, start: () => ({ sheet: 'add-feed' }) },
  { screen: 'Reading view', worlds: READING_WORLDS, render: () => <ReadingScreen id={FIXTURE_ROWS[0].id} /> },
  // A Feed that has stopped updating: its chip's badge (FEE-126).
  { screen: 'Not updating', worlds: NOT_UPDATING_WORLDS, render: (spec) => <FeedsScreen feed={spec.feed} /> },
  // Its new-address sheet, open (FEE-129).
  { screen: 'New address', worlds: NEW_ADDRESS_WORLDS, render: (spec) => <FeedsScreen feed={spec.feed} />, start: () => ({ sheet: 'new-address' }) },
  {
    screen: 'Account',
    worlds: ACCOUNT_WORLDS,
    render: () => <FeedsScreen />,
    start: (spec) => ({ sheet: spec.accountSheet === 'open' ? 'account' : undefined }),
  },
];
