import { SymbolView } from 'expo-symbols';
import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/components/app-text';
import { ROW_ACTIONS, type RowActionName } from '@/components/row-action';
import { commits, dragOffset, pastCommitPoint } from '@/components/swipe-physics';
import { useEnvironment, useSizeScale } from '@/environment';
import { thresholdHaptic } from '@/environment/haptics';
import { themes } from '@/theme/tokens';

const ICON = 24;
/** The panel's icon grows a little past the commit point: letting go now will act. */
const ARMED_SCALE = 1.15;
/** The finger needs this much sideways travel before the row moves, so a scroll stays a scroll. */
const ACTIVE_X = 16;
/** Moving this far up or down first makes it a scroll, never a swipe. */
const FAIL_Y = 12;
/** A committed row sliding away: out on a strong ease-out, quick. */
const LEAVE = { duration: 180, easing: Easing.bezier(0.23, 1, 0.32, 1), reduceMotion: ReduceMotion.System };
/** Back home after a drag, carrying the finger's speed, settling without wobble. */
const HOME = { duration: 400, dampingRatio: 0.85, reduceMotion: ReduceMotion.System };
const ARM = { duration: 200, dampingRatio: 0.7, reduceMotion: ReduceMotion.System };
/** If a committed row is still here after this (the change didn't go through), it comes back. */
const COME_BACK_AFTER = 600;

/**
 * A row you swipe left to Save, or to mark Done (P11), as the Todoist reference previews it (§8):
 * dragging reveals a panel saying what letting go will do, Gold with a bookmark for Save (D5), the
 * surface with a check for Done; past the commit point its icon grows and one tick is felt (Q18).
 * Let go early and it springs back, so trying costs nothing; a quick flick is enough. `leaves`: the
 * row leaves this list when it commits (Done in Saved), so it slides away first. The drag runs on
 * the UI thread; Remove animations makes every settle instant (Q17). Android keeps its screen
 * edges for back (Q18): the system claims touches there before any row sees them. TalkBack has the
 * same action on the row itself (Q15).
 */
export function SwipeRow({
  id,
  action,
  leaves,
  onCommit,
  children,
}: {
  id: string;
  action: RowActionName;
  leaves: boolean;
  onCommit: () => void;
  children: ReactNode;
}) {
  const { width } = useWindowDimensions();
  const { colorScheme } = useEnvironment();
  const scale = useSizeScale();
  const theme = themes[colorScheme];
  const offset = useSharedValue(0);
  const armed = useSharedValue(false);
  // How many times this row has slid away to act; each time, it comes back if it's still here.
  const [leftTimes, setLeftTimes] = useState(0);
  useEffect(() => {
    if (leftTimes === 0) return;
    const timer = setTimeout(() => offset.set(withSpring(0, HOME)), COME_BACK_AFTER);
    return () => clearTimeout(timer);
  }, [leftTimes, offset]);

  const commit = () => {
    onCommit();
    if (leaves) setLeftTimes((times) => times + 1);
  };

  const pan = Gesture.Pan()
    .withTestId(`swipe-${id}`)
    .activeOffsetX([-ACTIVE_X, ACTIVE_X])
    .failOffsetY([-FAIL_Y, FAIL_Y])
    .onUpdate((event) => {
      const next = dragOffset(event.translationX, width);
      offset.set(next);
      const past = pastCommitPoint(next, width);
      if (past !== armed.get()) {
        armed.set(past);
        // One tick, at the moment it crosses: never per frame.
        if (past) scheduleOnRN(thresholdHaptic);
      }
    })
    .onEnd((event) => {
      const go = commits(offset.get(), event.velocityX, width);
      armed.set(false);
      if (go && leaves) {
        offset.set(
          withTiming(-width, LEAVE, (finished) => {
            if (finished) scheduleOnRN(commit);
          }),
        );
        return;
      }
      offset.set(withSpring(0, { ...HOME, velocity: event.velocityX }));
      if (go) scheduleOnRN(commit);
    })
    .onFinalize((_event, success) => {
      // Cancelled (a scroll took over, or the system did): home, nothing done.
      if (!success) {
        armed.set(false);
        offset.set(withSpring(0, HOME));
      }
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.get() }] }));
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: withSpring(armed.get() ? ARMED_SCALE : 1, ARM) }] }));

  const look = ROW_ACTIONS[action];
  // On Gold, the page's own background colour reads clearly (Q14); on the surface, the text colour.
  const ink = action === 'save' ? theme.background : theme.text;

  return (
    <View>
      <View
        testID={`swipe-panel-${action}`}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={StyleSheet.absoluteFill}
        className={`flex-row items-center justify-end gap-related px-edge ${look.panel}`}
      >
        <AppText variant="action" className={look.ink} accessible={false}>
          {look.label}
        </AppText>
        <Animated.View style={iconStyle}>
          <SymbolView name={look.icon} size={ICON * scale} tintColor={ink} />
        </Animated.View>
      </View>
      <GestureDetector gesture={pan}>
        <Animated.View testID={`swipe-row-${id}`} style={rowStyle}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
