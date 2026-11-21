import type { ComponentType } from 'react';

// Loaded only in development builds: a release build's bundler folds `__DEV__` to false and
// drops the gallery's code. The root stack also guards this route with `__DEV__` (T13).
const Gallery: ComponentType | null = __DEV__
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/screens/gallery/gallery-screen').GalleryScreen
  : null;

export default function GalleryRoute() {
  if (!__DEV__ || !Gallery) return null;
  return <Gallery />;
}
