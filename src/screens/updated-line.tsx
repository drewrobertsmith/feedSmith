import { useEffect } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LayoutAnimationConfig } from 'react-native-reanimated';

import { AppText } from '@/components/app-text';
import { useEnvironment, useMinuteClock } from '@/environment';
import { useLastUpdated } from '@/feeds/feeds-data';
import { updatedLine, type UpdatedLine as Parts } from '@/feeds/use-pull';
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

/**
 * The line under the Feeds title (FEE-47): how fresh All is, so you know whether pulling down is worth it.
 * Information, not a count (P7). Nothing until there's something to say: it draws no view then, so the top
 * bar has no gap under its title. "Updating…" lasts until a pull's results are on screen (FEE-103). It reads
 * the minute clock itself, so a minute passing renders only this line, not the Feeds screen (FEE-106). Offline,
 * it says so in place of the pull (FEE-32).
 */
export function FeedsUpdatedLine({ refreshing, offline }: { refreshing: boolean; offline: boolean }) {
  const lastUpdated = useLastUpdated();
  const now = useMinuteClock();
  // Going offline is said once, out loud, for TalkBack (FEE-32); the line itself isn't read on every change.
  useEffect(() => {
    if (offline) AccessibilityInfo.announceForAccessibility('Offline');
  }, [offline]);
  const parts = updatedLine(refreshing, lastUpdated.status === 'ready' ? lastUpdated.at : null, now, offline);
  return parts ? <UpdatedLine {...parts} /> : null;
}
