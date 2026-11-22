import { useEffect, useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { reorderHandleProps } from '@/components/reorder-handle';
import { useEnvironment } from '@/environment';
import { motion } from '@/theme/motion';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';

/** How high a lifted row floats (Android elevation), and how round its card is. */
const LIFT_ELEVATION = 6;
const CARD_RADIUS = 12;
/** Padded the same at rest and lifted, so the card appears without moving anything; it reaches into the edge gutter. */
const CARD = { marginHorizontal: -spacing.related, paddingHorizontal: spacing.related, borderRadius: CARD_RADIUS };

/**
 * A row in a short list that can be dragged by its handle (D13). This is the only place the
 * drag gesture lives: React Native Reanimated can't run under Jest yet (FEE-33), so tests
 * replace it (test/jest-setup.js) and drive `onDrop` directly. On release it reports the
 * index the row was dropped at; the list re-orders, and the row springs home.
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
  const { colorScheme } = useEnvironment();
  const surface = themes[colorScheme].surface;
  const [height, setHeight] = useState(1);
  const offset = useSharedValue(0);
  const lifted = useSharedValue(0);

  // Dropped, the row waits in its new slot; once the list re-orders, that slot is its own.
  useEffect(() => {
    offset.set(0);
  }, [index, offset]);

  // Springs follow the system's "Remove animations" (Reanimated's ReduceMotion.System default, Q17).
  const pan = Gesture.Pan()
    .onBegin(() => {
      lifted.set(withSpring(1, motion.rowLift));
    })
    .onUpdate((event) => {
      offset.set(event.translationY);
    })
    .onFinalize(() => {
      const to = Math.max(0, Math.min(count - 1, index + Math.round(offset.get() / height)));
      offset.set(withSpring((to - index) * height, motion.rowLift));
      lifted.set(withSpring(0, motion.rowLift));
      if (to !== index) scheduleOnRN(onDrop, to);
    });

  // Lifted, the whole row becomes one card (handle, text and actions) that moves as a unit;
  // at rest the card fades away and the list stays quiet.
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.get() }, { scale: 1 + lifted.get() * 0.02 }],
    zIndex: lifted.get() > 0 ? 1 : 0,
    backgroundColor: interpolateColor(lifted.get(), [0, 1], ['transparent', surface]),
    elevation: lifted.get() * LIFT_ELEVATION,
  }));

  return (
    <Animated.View style={[CARD, style]} onLayout={(e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height || 1)}>
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
