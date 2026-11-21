import type { ReactElement } from 'react';

import { AddFeedScreen } from '@/screens/add-feed-screen';
import { FeedsScreen } from '@/screens/feeds-screen';
import { ManageFeedsScreen } from '@/screens/manage-feeds-screen';
import { ReadingScreen } from '@/screens/reading/reading-screen';
import { SavedScreen } from '@/screens/saved-screen';
import { SignInScreen } from '@/screens/sign-in/sign-in-screen';
import { ADD_FEED_WORLDS, ALL_WORLDS, MANAGE_WORLDS, READING_WORLDS, SHELL_WORLDS, SIGN_IN_WORLDS } from '@/worlds/catalog';
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
    render: (spec) => (spec.section === 'saved' ? <SavedScreen /> : <FeedsScreen />),
  },
  {
    screen: 'Sign in',
    worlds: SIGN_IN_WORLDS,
    render: () => <SignInScreen />,
  },
  { screen: 'All', worlds: ALL_WORLDS, render: (spec) => <FeedsScreen feed={spec.feed} /> },
  { screen: 'Add a Feed', worlds: ADD_FEED_WORLDS, render: () => <AddFeedScreen /> },
  { screen: 'Manage Feeds', worlds: MANAGE_WORLDS, render: () => <ManageFeedsScreen /> },
  { screen: 'Reading view', worlds: READING_WORLDS, render: () => <ReadingScreen id={FIXTURE_ROWS[0].id} /> },
];
