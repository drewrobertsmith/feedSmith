import { useState, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { motion } from '@/theme/motion';

/**
 * A row in a short list that can be dragged by its handle (D13). This is the only place the
 * drag gesture lives: React Native Reanimated can't run under Jest yet (FEE-33), so tests
 * replace it (test/jest-setup.js) and drive `onDrop` directly. On release it reports the
 * index the row was dropped at; the list re-orders, and the row springs home.
 * TalkBack users order with the row's own actions instead (Q15).
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
  const [height, setHeight] = useState(1);
  const offset = useSharedValue(0);
  const lifted = useSharedValue(0);

  const pan = Gesture.Pan()
    .onBegin(() => {
      lifted.value = withSpring(1, motion.rowLift);
    })
    .onUpdate((event) => {
      offset.value = event.translationY;
    })
    .onFinalize(() => {
      const to = Math.max(0, Math.min(count - 1, index + Math.round(offset.value / height)));
      offset.value = withSpring(0, motion.rowLift);
      lifted.value = withSpring(0, motion.rowLift);
      if (to !== index) scheduleOnRN(onDrop, to);
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }, { scale: 1 + lifted.value * 0.02 }],
    zIndex: lifted.value > 0 ? 1 : 0,
  }));

  return (
    <Animated.View style={style} onLayout={(e: LayoutChangeEvent) => setHeight(e.nativeEvent.layout.height || 1)}>
      <View className="flex-row items-center">
        <GestureDetector gesture={pan}>
          <View aria-label={handleLabel} accessible={false} hitSlop={8}>
            {handle}
          </View>
        </GestureDetector>
        <View className="flex-1">{children}</View>
      </View>
    </Animated.View>
  );
}
