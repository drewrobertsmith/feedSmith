import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated';

/**
 * Makes every Reanimated animation obey the environment's reduce-motion setting,
 * so later slices honour Android's "Remove animations" without checking it themselves (Q17).
 */
export function MotionConfig({ reduceMotion }: { reduceMotion: boolean }) {
  return <ReducedMotionConfig mode={reduceMotion ? ReduceMotion.Always : ReduceMotion.Never} />;
}
