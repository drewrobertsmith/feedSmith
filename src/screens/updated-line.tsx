import { View } from 'react-native';
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { useEnvironment } from '@/environment';
import type { UpdatedLine as Parts } from '@/feeds/use-pull';
import { motion } from '@/theme/motion';

const OUT = FadeOut.duration(motion.lineChange.out);
const IN = FadeIn.delay(motion.lineChange.out).duration(motion.lineChange.in);

/**
 * The line under the Feeds title (D20, FEE-104), drawn in its parts so only what changes moves: when a
 * part's words change, the old words fade out fully, then the new ones fade in, in the same moment as the
 * rows. "Updated" stays put while the time changes. When the screen opens, the line is simply there. TalkBack
 * hears it as one line. With Remove animations on, the text just changes (Q17).
 */
export function UpdatedLine({ still, time }: Parts) {
  const { reduceMotion } = useEnvironment();
  const entering = reduceMotion ? undefined : IN;
  const exiting = reduceMotion ? undefined : OUT;
  return (
    <View testID="updated-line" accessible accessibilityRole="text" aria-label={still + time} className="flex-row">
      {/* The line's first words appear with the screen; only a later change of words moves (seen frame by frame). */}
      <LayoutAnimationConfig skipEntering>
      <Animated.View key={still} entering={entering} exiting={exiting}>
        <AppText variant="label" className="text-text-muted">
          {still}
        </AppText>
      </Animated.View>
      {time ? (
        <Animated.View key={time} entering={entering} exiting={exiting}>
          <AppText variant="label" className="text-text-muted">
            {time}
          </AppText>
        </Animated.View>
      ) : null}
      </LayoutAnimationConfig>
    </View>
  );
}
