/**
 * Whether Reanimated is reducing motion right now: the state `ReducedMotionConfig` sets (Q17).
 * Read from Reanimated itself, now that it runs for real under Jest (FEE-33), from the same
 * compiled build the app imports (`lib/module`), so it's the instance `ReducedMotionConfig` sets.
 */
export function reanimatedReducesMotion(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { ReducedMotionManager } = require('react-native-reanimated/lib/module/ReducedMotion');
  return ReducedMotionManager.jsValue as boolean;
}
