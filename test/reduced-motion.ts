/**
 * Whether Reanimated is reducing motion right now: the state `ReducedMotionConfig` sets (Q17).
 * Read from Reanimated itself, now that it runs for real under Jest (FEE-33), from the same
 * compiled build the app imports (`lib/module`), so it's the instance `ReducedMotionConfig` sets.
 */
export function reanimatedReducesMotion(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ReducedMotionManager } = require('react-native-reanimated/lib/module/ReducedMotion');
  if (typeof ReducedMotionManager?.jsValue !== 'boolean') {
    throw new Error(
      "test/reduced-motion.ts (FEE-33): Reanimated's ReducedMotionManager.jsValue moved. Find where " +
        'ReducedMotionConfig now stores its state (react-native-reanimated/src/component/ReducedMotionConfig.tsx).',
    );
  }
  return ReducedMotionManager.jsValue;
}
