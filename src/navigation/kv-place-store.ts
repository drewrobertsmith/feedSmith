import { Storage } from 'expo-sqlite/kv-store';

import type { PlaceStore } from '@/navigation/place';

const KEY = 'place';

/**
 * Your place on the phone (FEE-130): expo-sqlite's key-value store, read synchronously so the screens open
 * there on their first frame. It holds only the route and scroll offsets (T6).
 */
export const kvPlaceStore: PlaceStore = {
  read: () => Storage.getItemSync(KEY),
  write: (value) => Storage.setItemSync(KEY, value),
};
