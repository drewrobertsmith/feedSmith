import { createContext, use, useEffect, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { moved, slotFor, slotTop, totalHeight } from '@/components/drag-slots';
import { reorderHandleProps } from '@/components/reorder-handle';
import { useEnvironment } from '@/environment';
import { motion } from '@/theme/motion';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';

const CARD_RADIUS = 12;
const MAKE_ROOM = { duration: motion.rowMakeRoom.duration, easing: Easing.bezier(...motion.rowMakeRoom.easing) };
/**
 * Every row is placed by the drag's order, not by the list's layout. It reaches into the edge
 * gutter and is padded the same at rest and lifted, so the card appears without moving anything.
 */
const CARD = {
  position: 'absolute',
  top: 0,
  left: -spacing.related,
  right: -spacing.related,
  paddingHorizontal: spacing.related,
  borderRadius: CARD_RADIUS,
} as const;

/** What every row in a list knows: the order rows sit in, each row's height, and which row is held. */
type DragState = {
  order: SharedValue<string[]>;
  heights: SharedValue<Record<string, number>>;
  held: SharedValue<string | null>;
  gap: number;
};
const DragContext = createContext<DragState | null>(null);

/**
 * A short list whose rows can be reordered by dragging (D13). Rows sit where the drag's own order
 * puts them, so as one is held the others step aside into its new order, and when the saved order
 * comes back it already matches: nothing moves twice.
 */
export function DragList({ ids, gap, children }: { ids: string[]; gap: number; children: ReactNode }) {
  const order = useSharedValue(ids);
  const heights = useSharedValue<Record<string, number>>({});
  const held = useSharedValue<string | null>(null);

  // The saved order is the truth between drags; during one, the drag's order leads.
  useEffect(() => {
    if (held.get() === null) order.set(ids);
  }, [ids, held, order]);

  const box = useAnimatedStyle(() => ({ height: totalHeight(order.get(), heights.get(), gap) }));

  return (
    <DragContext value={{ order, heights, held, gap }}>
      <Animated.View style={box}>{children}</Animated.View>
    </DragContext>
  );
}

/**
 * A row in a `DragList`, dragged by its handle. This and `DragList` are the only places the drag
 * gesture lives: React Native Reanimated can't run under Jest yet (FEE-33), so tests replace them
 * (test/jest-setup.js) and drive `onDrop` directly; the slot math is tested on its own
 * (drag-slots). Held, the row lifts as one card: its background turns to the surface colour,
 * with no shadow or outline. The others step aside on one quick curve; let go, the row settles
 * into its gap on a smooth spring, and reports where it landed.
 * TalkBack users order from the same handle, with its Move up and Move down actions (Q15).
 */
export function DragRow({
  id,
  index,
  count,
  handle,
  handleLabel,
  onDrop,
  children,
}: {
  id: string;
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
  const { order, heights, held, gap } = drag;
  const { colorScheme } = useEnvironment();
  const { background, surface } = themes[colorScheme];
  /** Where the row is drawn: its slot, or under the finger while held. */
  const y = useSharedValue(0);
  const lifted = useSharedValue(0);
  /** The order when this row was picked up; the drag is measured from it. */
  const start = useSharedValue<string[]>([]);

  const slot = useDerivedValue(() => slotTop(order.get(), heights.get(), gap, id));

  // Follow the slot: a quick settled step while another row is held (making room), straight
  // there otherwise (first layout, a TalkBack move). Spring and timing both follow
  // "Remove animations" (Reanimated's ReduceMotion.System default, Q17).
  useAnimatedReaction(
    () => slot.get(),
    (next, previous) => {
      const holder = held.get();
      if (holder === id) return;
      y.set(holder !== null && previous !== null ? withTiming(next, MAKE_ROOM) : next);
    },
  );

  const pan = Gesture.Pan()
    .onBegin(() => {
      start.set(order.get());
      held.set(id);
      lifted.set(withSpring(1, motion.rowLift));
    })
    .onUpdate((event) => {
      const from = start.get().indexOf(id);
      const sizes = start.get().map((other) => heights.get()[other] ?? 0);
      y.set(slotTop(start.get(), heights.get(), gap, id) + event.translationY);
      const { to } = slotFor(from, event.translationY, sizes, gap, sizes.length);
      const next = moved(start.get(), from, to);
      if (next.join('\n') !== order.get().join('\n')) order.set(next);
    })
    .onFinalize(() => {
      const from = start.get().indexOf(id);
      const to = order.get().indexOf(id);
      held.set(null);
      // Settle into the gap the others opened; the saved order will match it.
      y.set(withSpring(slotTop(order.get(), heights.get(), gap, id), motion.rowLift));
      lifted.set(withSpring(0, motion.rowLift));
      if (from >= 0 && to !== from) scheduleOnRN(onDrop, to);
    });

  // Held, the whole row (handle, text and actions) becomes one card that moves as a unit.
  // Only the background changes, from the page's to the surface colour: no shadow, no outline.
  // Unmeasured, it stays hidden, so rows never show stacked on the first frame.
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.get() }, { scale: 1 + lifted.get() * 0.02 }],
    zIndex: lifted.get() > 0 ? 1 : 0,
    opacity: heights.get()[id] === undefined ? 0 : 1,
    backgroundColor: interpolateColor(lifted.get(), [0, 1], [background, surface]),
  }));

  const measure = (event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    heights.modify((sizes) => {
      'worklet';
      return { ...sizes, [id]: height };
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
