import { createContext, use } from 'react';
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
  /** Called once the lead image is drawn, so the travelling picture can hand over without a gap. */
  displayed: () => void;
  style: ReturnType<typeof useAnimatedStyle>;
};
export const LeadSlotContext = createContext<LeadSlotValue | undefined>(undefined);

/** For the lead image's own `onDisplay`: tells the transition it's drawn (FEE-114); undefined when not the lead. */
export function useLeadDisplayed(active: boolean): (() => void) | undefined {
  const slot = use(LeadSlotContext);
  return active ? slot?.displayed : undefined;
}
