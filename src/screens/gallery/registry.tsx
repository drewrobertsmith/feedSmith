import type { ReactElement } from 'react';

import { FeedsScreen } from '@/screens/feeds-screen';
import { SavedScreen } from '@/screens/saved-screen';
import { SHELL_WORLDS } from '@/worlds/catalog';
import type { CatalogWorld, WorldSpec } from '@/worlds/world';

type GalleryEntry = {
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
];
