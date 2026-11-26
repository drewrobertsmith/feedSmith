import type { LegendListRef } from '@legendapp/list/react-native';
import { createContext, use, useEffect, useState, type ReactNode, type RefObject } from 'react';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useEnvironment } from '@/environment';
import { motion } from '@/theme/motion';

const { duration, easing, fadeIn } = motion.rowsArrive;
const EASE = { duration, easing: Easing.bezier(...easing) };

/**
 * How long after an arrival starts the list may still move the rows for it: the move, and the new rows
 * measuring themselves (their places correct from an estimate), so a correction joins the same movement.
 */
const ARRIVAL_WINDOW = duration * 2;

type Arrival = { arrived: readonly string[]; shift: SharedValue<number> | null };
const ArrivalContext = createContext<Arrival>({ arrived: [], shift: null });

/**
 * New Articles arriving in view at the top (FEE-104). Legend List places the rows below the new ones at
 * once (it can't animate an insert at the start), so every row shares one `shift`: the moment the list
 * moves the first existing row, the shift puts all rows back where they were and eases them down together
 * on `motion.rowsArrive`. A later correction, as the new rows measure themselves, folds into the same move.
 * Nothing else moves the rows, and Remove animations never starts it (Q17).
 *
 * `ids` is the list as shown, `arrived` the ones that just arrived (from `useNewArticles`).
 */
export function useArrival(list: RefObject<LegendListRef | null>, ids: readonly string[], arrived: readonly string[]) {
  const { reduceMotion } = useEnvironment();
  const shift = useSharedValue(0);
  // The first Article that was already on screen, and where the list had it, read before the list takes the
  // new rows: in render, the moment the arrival is known, while the list still holds its old layout.
  const [anchor, setAnchor] = useState<{ arrived: readonly string[]; key?: string; from?: number }>({ arrived });
  if (anchor.arrived !== arrived) {
    const key = arrived.length > 0 && !reduceMotion ? ids.find((id) => !arrived.includes(id)) : undefined;
    setAnchor({ arrived, key, from: key === undefined ? undefined : list.current?.getState().positionByKey(key) });
  }
  useEffect(() => {
    const { key, from } = anchor;
    const state = list.current?.getState();
    if (key === undefined || from === undefined || !state) return;
    let last = from;
    const stop = state.listenToPosition(key, (at) => {
      // The list moved the row by `at - last`: undo that on screen, then ease to where it now is.
      shift.set(shift.get() - (at - last));
      last = at;
      shift.set(withTiming(0, EASE));
    });
    const done = setTimeout(stop, ARRIVAL_WINDOW);
    return () => {
      clearTimeout(done);
      stop();
    };
  }, [anchor, list, shift]);
  return { arrived, shift };
}

/** Gives the rows below `useArrival`'s shift and the Articles that just arrived. */
export function ArrivalProvider({ value, children }: { value: Arrival; children: ReactNode }) {
  return <ArrivalContext value={value}>{children}</ArrivalContext>;
}

const ARRIVED_FADE = FadeIn.delay(duration).duration(fadeIn);

/**
 * One row of Feeds. Every row moves with the arrival's shift; a row that just arrived fades in once the
 * rows below have made room, so it never shows over them while they move.
 */
export function ArrivingRow({ id, children }: { id: string; children: ReactNode }) {
  const { arrived, shift } = use(ArrivalContext);
  const { reduceMotion } = useEnvironment();
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: shift ? shift.get() : 0 }] }));
  const entering = !reduceMotion && arrived.includes(id) ? ARRIVED_FADE : undefined;
  return (
    <Animated.View entering={entering} style={style}>
      {children}
    </Animated.View>
  );
}
