import { use, useLayoutEffect, useRef, type ReactNode } from 'react';
import Animated from 'react-native-reanimated';

import { rectOf, type ViewRef } from '@/navigation/measure';
import { LeadSlotContext, type LeadSlotValue } from '@/screens/reading/lead-slot-context';


/**
 * Wraps the page's lead image (FEE-114). Outside a transition (the state gallery), or not `active`, it's
 * just its child.
 */
export function LeadSlot({ active, children }: { active: boolean; children: ReactNode }) {
  const slot = use(LeadSlotContext);
  return active && slot ? <MeasuredLead slot={slot}>{children}</MeasuredLead> : children;
}

function MeasuredLead({ slot, children }: { slot: LeadSlotValue; children: ReactNode }) {
  const view = useRef<ViewRef>(null);
  const { register, laidOut, style } = slot;
  // Before layout events arrive, so the first one can measure.
  useLayoutEffect(() => register(() => rectOf(view.current)), [register]);
  return (
    <Animated.View ref={view} onLayout={laidOut} collapsable={false} style={style}>
      {children}
    </Animated.View>
  );
}
