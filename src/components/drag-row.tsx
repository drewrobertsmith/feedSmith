import { createContext, use, useEffect, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolateColor,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { shiftFor, slotFor } from '@/components/drag-slots';
import { reorderHandleProps } from '@/components/reorder-handle';
import { useEnvironment } from '@/environment';
import { motion } from '@/theme/motion';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';

const CARD_RADIUS = 12;
/** Padded the same at rest and lifted, so the card appears without moving anything; it reaches into the edge gutter. */
const CARD = { marginHorizontal: -spacing.related, paddingHorizontal: spacing.related, borderRadius: CARD_RADIUS };

/** What every row in a list knows about the drag: which row is held, how far it's moved, and each row's height. */
type DragState = {
  held: SharedValue<number>;
  by: SharedValue<number>;
  heights: SharedValue<number[]>;
  gap: number;
};
const DragContext = createContext<DragState | null>(null);

/**
 * A short list whose rows can be reordered by dragging (D13). While one row is held, the others
 * slide out of its way, so the gap where it would land is always open.
 */
export function DragList({ gap, children }: { gap: number; children: ReactNode }) {
  const held = useSharedValue(-1);
  const by = useSharedValue(0);
  const heights = useSharedValue<number[]>([]);
  return (
    <DragContext value={{ held, by, heights, gap }}>
      <View style={{ gap }}>{children}</View>
    </DragContext>
  );
}

/**
 * A row in a `DragList`, dragged by its handle. This and `DragList` are the only places the drag
 * gesture lives: React Native Reanimated can't run under Jest yet (FEE-33), so tests replace them
 * (test/jest-setup.js) and drive `onDrop` directly; the slot math is tested on its own
 * (drag-slots). Held, the row lifts as one card: its background turns to the surface colour,
 * with no shadow or outline. On release it settles into the open gap and reports where.
 * TalkBack users order from the same handle, with its Move up and Move down actions (Q15).
 */
export function DragRow({
  index,
  count,
  handle,
  handleLabel,
  onDrop,
  children,
}: {
  index: number;
  count: number;
  handle: ReactNode;
  handleLabel: string;
  /** Called with the index the row was dropped at, when it moved. */
  onDrop: (to: number) => void;
  children: ReactNode;
}) {
  const drag = use(DragContext);
  if (!drag) throw new Error('DragRow must be inside a DragList');
  const { held, by, heights, gap } = drag;
  const { colorScheme } = useEnvironment();
  const { background, surface } = themes[colorScheme];
  /** This row's own travel while held, then its settle into the gap. */
  const offset = useSharedValue(0);
  /** How far this row has slid to make room for another. */
  const shift = useSharedValue(0);
  const lifted = useSharedValue(0);

  // Once the list re-orders, every row's new place is its own: the drag is over.
  useEffect(() => {
    held.set(-1);
    offset.set(0);
    shift.set(0);
  }, [index, held, offset, shift]);

  // Make room as the held row passes; springs follow "Remove animations" (Reanimated's ReduceMotion.System default, Q17).
  useAnimatedReaction(
    () => shiftFor(index, held.get(), by.get(), heights.get(), gap, count),
    (room, previous) => {
      if (room !== previous) shift.set(withSpring(room, motion.rowLift));
    },
  );

  const pan = Gesture.Pan()
    .onBegin(() => {
      held.set(index);
      by.set(0);
      lifted.set(withSpring(1, motion.rowLift));
    })
    .onUpdate((event) => {
      offset.set(event.translationY);
      by.set(event.translationY);
    })
    .onFinalize(() => {
      const { to, settle } = slotFor(index, offset.get(), heights.get(), gap, count);
      // Settle into the gap the others opened; the list re-orders under it.
      offset.set(withSpring(settle, motion.rowLift));
      lifted.set(withSpring(0, motion.rowLift));
      if (to !== index) scheduleOnRN(onDrop, to);
      else held.set(-1);
    });

  // Held, the whole row (handle, text and actions) becomes one card that moves as a unit.
  // Only the background changes, from the page's to the surface colour: no shadow, no outline.
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.get() + shift.get() }, { scale: 1 + lifted.get() * 0.02 }],
    zIndex: lifted.get() > 0 ? 1 : 0,
    backgroundColor: interpolateColor(lifted.get(), [0, 1], [background, surface]),
  }));

  const measure = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    heights.modify((list) => {
      'worklet';
      const next = list.slice(0, count);
      next[index] = height;
      return next;
    });
  };

  return (
    <Animated.View style={[CARD, style]} onLayout={measure}>
      <View className="flex-row items-center">
        <GestureDetector gesture={pan}>
          <View {...reorderHandleProps({ index, count, label: handleLabel, onDrop })} hitSlop={8}>
            {handle}
          </View>
        </GestureDetector>
        <View className="flex-1">{children}</View>
      </View>
    </Animated.View>
  );
}
