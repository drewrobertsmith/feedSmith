import { useEffect, useEffectEvent } from 'react';

import PredictiveBack, { type BackEvent } from '../../modules/predictive-back/src/PredictiveBackModule';

export type { BackEvent };

/**
 * While `enabled`, Android's back gesture comes to `onBack` as it happens (FEE-114): its start, each step of
 * its progress, a cancel, and the commit. The screen then finishes the move and goes back itself; nothing
 * else hears that back. A back button or a three-button bar sends only the commit. Without the native module
 * (Jest, other platforms) back stays the navigator's.
 */
export function usePredictiveBack(enabled: boolean, onBack: (event: BackEvent) => void) {
  const handle = useEffectEvent(onBack);
  useEffect(() => {
    if (!enabled || !PredictiveBack) return;
    const module = PredictiveBack;
    const subscription = module.addListener('onBack', (event) => handle(event));
    void module.setEnabled(true);
    return () => {
      subscription.remove();
      void module.setEnabled(false);
    };
  }, [enabled]);
}
