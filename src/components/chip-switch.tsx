import { createContext, use, useEffect, useRef, type ReactNode } from 'react';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { chipDirection } from '@/screens/chip-direction';
import { motion } from '@/theme/motion';

const ShiftContext = createContext<SharedValue<number> | null>(null);
const EASING = Easing.bezier(...motion.chipSwitch.easing);

/**
 * Slides the list's rows in from the direction of travel when the chosen chip changes (FEE-42).
 * Every row reads the same value, so they move as one; the header around them stays still. With
 * "Remove animations" on, Reanimated's reduced-motion config makes it instant (Q17). This and
 * `SlideRow` are the only places it lives: Reanimated can't run under Jest (FEE-33), so tests
 * replace them (test/jest-setup.js) and the direction is tested on its own (chip-direction).
 */
export function ChipSwitch({ index, children }: { index: number; children: ReactNode }) {
  const shift = useSharedValue(0);
  const previous = useRef<number | null>(null);

  useEffect(() => {
    const direction = chipDirection(previous.current, index);
    previous.current = index;
    if (direction === 0) return;
    shift.set(direction * motion.chipSwitch.distance);
    shift.set(withTiming(0, { duration: motion.chipSwitch.duration, easing: EASING }));
  }, [index, shift]);

  return <ShiftContext value={shift}>{children}</ShiftContext>;
}

/** One row of a list inside `ChipSwitch`: it travels with the others, from a little faded. */
export function SlideRow({ children }: { children: ReactNode }) {
  const shift = use(ShiftContext);
  const style = useAnimatedStyle(() => {
    const at = shift ? shift.get() : 0;
    return {
      transform: [{ translateX: at }],
      opacity: interpolate(Math.abs(at), [0, motion.chipSwitch.distance], [1, motion.chipSwitch.fadeFrom]),
    };
  });
  return <Animated.View style={style}>{children}</Animated.View>;
}
