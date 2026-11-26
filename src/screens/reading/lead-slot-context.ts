import { createContext } from 'react';
import type { useAnimatedStyle } from 'react-native-reanimated';

import type { Rect } from '@/navigation/container-transform';

/**
 * What the transition asks of the page's lead image (FEE-114): to say where it is, once laid out and on
 * request, and to take a style that hides it while a row's thumbnail travels to its place.
 */
export type LeadSlotValue = {
  /** Called with a way to measure the lead image while it's mounted; returns its cleanup. */
  register: (measure: () => Rect | undefined) => () => void;
  /** Called once the lead image is laid out. */
  laidOut: () => void;
  style: ReturnType<typeof useAnimatedStyle>;
};
export const LeadSlotContext = createContext<LeadSlotValue | undefined>(undefined);
