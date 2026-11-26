import type { ComponentRef } from 'react';
import type { View } from 'react-native';

import type { Rect } from '@/navigation/container-transform';

export type ViewRef = ComponentRef<typeof View>;

/** Where a view is drawn now, in window coordinates; undefined where it can't be measured (Jest has no layout). */
export function rectOf(view: ViewRef | null): Rect | undefined {
  const box = view?.getBoundingClientRect?.();
  return box && box.width > 0 && box.height > 0 ? { x: box.x, y: box.y, width: box.width, height: box.height } : undefined;
}
