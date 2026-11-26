import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppSymbol } from '@/components/app-symbol';
import { AppText } from '@/components/app-text';
import { DepthPressable } from '@/components/depth-pressable';
import { useEnvironment } from '@/environment';
import { NOTE_ENTERING, NOTE_EXITING } from '@/screens/new-articles-note-motion';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';

const ARROW = 16;

/**
 * The quiet note that new Articles arrived above you while you read (FEE-102): "New Articles" and an
 * arrow up, never how many (P7). It floats over the rows under the status bar, so it's raised (D27), its
 * label full-strength, not Gold (D5). Tapping it goes to the top (`onPress`). It arrives because
 * something did, growing in and shrinking away like a Material floating button (FEE-118); with Remove
 * animations on it just appears and goes (Q17).
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
      <Animated.View entering={reduceMotion ? undefined : NOTE_ENTERING} exiting={reduceMotion ? undefined : NOTE_EXITING}>
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
