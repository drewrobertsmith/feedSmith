import { NativeModule, requireOptionalNativeModule } from 'expo';

/** One moment of Android's back gesture (FEE-114): a button or a three-button bar sends only `invoked`. */
export type BackEvent = {
  type: 'started' | 'progress' | 'cancelled' | 'invoked';
  /** How far the gesture has gone, 0 to 1. */
  progress: number;
  /** The screen edge the swipe started from. */
  edge: 'left' | 'right';
};

declare class PredictiveBackModule extends NativeModule<{ onBack: (event: BackEvent) => void }> {
  setEnabled(enabled: boolean): Promise<void>;
}

/** Android only; absent on other platforms and under Jest, where back stays the navigator's. */
export default requireOptionalNativeModule<PredictiveBackModule>('PredictiveBack');
