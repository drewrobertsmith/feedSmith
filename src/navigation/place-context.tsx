import { createContext, use, useEffect, useState, type ReactNode } from 'react';

import { createPlaceKeeper, type PlaceKeeper, type PlaceStore } from '@/navigation/place';

const PlaceContext = createContext<PlaceKeeper | null>(null);

/** Keeps your place for the screens below (FEE-130): one keeper for the app's life, writing when it leaves the screen. */
export function PlaceProvider({ store, children }: { store: PlaceStore; children: ReactNode }) {
  const [keeper] = useState(() => createPlaceKeeper(store));
  useEffect(() => keeper.start(), [keeper]);
  return <PlaceContext value={keeper}>{children}</PlaceContext>;
}

export function usePlaceKeeper(): PlaceKeeper {
  const keeper = use(PlaceContext);
  if (!keeper) throw new Error('usePlaceKeeper needs a PlaceProvider above it');
  return keeper;
}
