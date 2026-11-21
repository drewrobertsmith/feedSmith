import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated';

/**
 * Makes every Reanimated animation obey the environment's reduce-motion setting,
 * so later slices honour Android's "Remove animations" without checking it themselves (Q17).
 * With motion on, Reanimated keeps following the system: only a reduction is forced, which
 * also covers turning "Remove animations" on while the app runs (Reanimated reads it at start).
 */
export function MotionConfig({ reduceMotion }: { reduceMotion: boolean }) {
  return reduceMotion ? <ReducedMotionConfig mode={ReduceMotion.Always} /> : null;
}
