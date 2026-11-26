import { createContext, use, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { chipDirection } from '@/components/chip-direction';
import type { ArticleRow } from '@/feeds/feeds-data';
import { motion } from '@/theme/motion';

/** The rows the list shows, and the chip they belong to. */
export type ShownRows = { articles: ArticleRow[]; index: number };
/** Where the list's rows are on their way between chips: across, and how faded. */
export type ChipSlide = { shift: SharedValue<number>; fade: SharedValue<number> };

const { distance, out, in: arrive } = motion.chipSwitch;
const OUT_EASING = Easing.bezier(...motion.chipSwitch.outEasing);
const IN_EASING = Easing.bezier(...motion.chipSwitch.inEasing);

/** Leaving: the old chip's rows on their way out. Arriving: the new chip's rows on their way in. */
type Phase = { kind: 'still' } | { kind: 'leaving' | 'arriving'; direction: -1 | 1 };

/**
 * The rows the list shows while the chosen chip changes (FEE-116), on Material's shared axis X: the old chip's
 * rows leave away from the new chip's side and fade out, and only once they've gone do the new chip's rows
 * arrive from that side, fading in, so the two never share a place. New rows for the same chip, a chip with no
 * direction (the first showing, a removed Feed) and Remove animations (Q17) swap at once.
 */
export function useChipSwitch(shown: ShownRows, reduceMotion: boolean): { shown: ShownRows; slide: ChipSlide } {
  const shift = useSharedValue(0);
  const fade = useSharedValue(1);
  /** The rows on screen while they leave; the latest are swapped in once they've gone. */
  const [held, setHeld] = useState(shown);
  const [phase, setPhase] = useState<Phase>({ kind: 'still' });
  const latest = useRef(shown);
  useEffect(() => {
    latest.current = shown;
  });

  // Derived during render, as React recommends for adjusting state to new props.
  if (shown.index !== held.index && phase.kind !== 'leaving') {
    const direction = chipDirection(held.index, shown.index);
    if (direction === 0 || reduceMotion) setHeld(shown);
    else setPhase({ kind: 'leaving', direction });
  } else if (shown.index === held.index && shown !== held && phase.kind !== 'leaving') {
    setHeld(shown);
  }

  const arrived = () => setPhase({ kind: 'still' });
  const swap = () => {
    setHeld(latest.current);
    setPhase((now) => (now.kind === 'leaving' ? { kind: 'arriving', direction: now.direction } : now));
  };

  // Before paint, so the rows never show once at rest before they move.
  useLayoutEffect(() => {
    if (phase.kind === 'leaving') {
      fade.set(withTiming(0, { duration: out, easing: OUT_EASING }));
      shift.set(
        withTiming(-phase.direction * distance, { duration: out, easing: OUT_EASING }, (done) => {
          if (done) scheduleOnRN(swap);
        }),
      );
    } else if (phase.kind === 'arriving') {
      shift.set(phase.direction * distance);
      shift.set(withTiming(0, { duration: arrive, easing: IN_EASING }));
      fade.set(
        withTiming(1, { duration: arrive, easing: IN_EASING }, (done) => {
          if (done) scheduleOnRN(arrived);
        }),
      );
    }
    // Only a new phase moves the rows; `swap` and `arrived` read the latest state when they run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  return { shown: phase.kind === 'leaving' ? held : shown.index === held.index ? shown : held, slide: { shift, fade } };
}

const SlideContext = createContext<ChipSlide | null>(null);

/**
 * Around the list whose rows move between chips (FEE-116). `index` is the chip whose rows these are; every row
 * reads the same `slide`, so they move as one, and the header around them stays still.
 */
export function ChipSwitch({ slide, children }: { index: number; slide: ChipSlide; children: ReactNode }) {
  return <SlideContext value={slide}>{children}</SlideContext>;
}

/** One row of a list inside `ChipSwitch`: it moves and fades with the others. */
export function SlideRow({ children }: { children: ReactNode }) {
  // Each shared value in the style's own closure: Reanimated only follows those, not ones inside an object.
  const shift = use(SlideContext)?.shift;
  const fade = use(SlideContext)?.fade;
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: shift ? shift.get() : 0 }],
    opacity: fade ? fade.get() : 1,
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}
