import { View } from 'react-native';
import Animated, { Easing, FadeOut, Keyframe } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppSymbol } from '@/components/app-symbol';
import { AppText } from '@/components/app-text';
import { DepthPressable } from '@/components/depth-pressable';
import { useEnvironment } from '@/environment';
import { motion } from '@/theme/motion';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';

const { distance, duration, exit, easing } = motion.newArticlesNote;
const ENTERING = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: -distance }] },
  100: { opacity: 1, transform: [{ translateY: 0 }], easing: Easing.bezier(...easing) },
}).duration(duration);
const EXITING = FadeOut.duration(exit);
const ARROW = 16;

/**
 * The quiet note that new Articles arrived above you while you read (FEE-102): "New Articles" and an
 * arrow up, never how many (P7). It floats over the rows under the status bar, so it's raised (D27), its
 * label full-strength, not Gold (D5). Tapping it goes to the top (`onPress`). It arrives because
 * something did, on `motion.newArticlesNote`; with Remove animations on it just appears (Q17).
 */
export function NewArticlesNote({ onPress }: { onPress: () => void }) {
  const insets = useSafeAreaInsets();
  const { colorScheme, reduceMotion } = useEnvironment();
  return (
    <View
      pointerEvents="box-none"
      className="absolute w-full items-center"
      style={{ top: insets.top + spacing.related }}
    >
      <Animated.View entering={reduceMotion ? undefined : ENTERING} exiting={reduceMotion ? undefined : EXITING}>
        <DepthPressable
          level="raised"
          role="button"
          aria-label="New Articles, go to top"
          onPress={onPress}
          className="flex-row items-center gap-related rounded-full px-group py-related"
        >
          <AppSymbol name={{ ios: 'arrow.up', android: 'arrow_upward' }} size={ARROW} tintColor={themes[colorScheme].text} />
          <AppText variant="label" className="text-text">
            New Articles
          </AppText>
        </DepthPressable>
      </Animated.View>
    </View>
  );
}
