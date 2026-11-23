import { useIsFocused } from 'expo-router';
import type { ReactNode } from 'react';
import Animated, { Easing, SharedTransition, SharedTransitionBoundary } from 'react-native-reanimated';

import { useEnvironment } from '@/environment';
import { motion } from '@/theme/motion';

const { duration, easing, fadeOutEnd, fadeIn } = motion.articleOpen;

/**
 * Opening an Article (FEE-48, D30): the title's box travels from the row to the headline's place and grows
 * into it, while the row's words fade out and the headline's fade in as it lands, Material's container
 * transform. The text itself can't grow smoothly (a font size changes at once when the move ends, and the
 * row and headline wrap differently), so it's the box that moves and the words that cross-fade.
 */
const OPEN = SharedTransition.duration(duration)
  .easing(Easing.bezier(...easing))
  .fadeContent({ fadeOut: { end: fadeOutEnd }, fadeIn: { duration: fadeIn } });

/**
 * An Article's title, shared between its row and the Reading view's headline. With Remove animations on
 * (Q17), read from the environment like all motion here, nothing is shared and opening is a plain cut.
 */
export function SharedTitle({ articleId, children }: { articleId: string; children: ReactNode }) {
  const { reduceMotion } = useEnvironment();
  return (
    <Animated.View
      sharedTransitionTag={reduceMotion ? undefined : `article-title-${articleId}`}
      sharedTransitionStyle={OPEN}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Wraps a screen whose titles can travel: only the screen in front takes part, so a title doesn't fly in
 * from a screen behind it, or from the other tab, which stays mounted.
 */
export function SharedTitleScreen({ children }: { children: ReactNode }) {
  const focused = useIsFocused();
  return <SharedTransitionBoundary isActive={focused}>{children}</SharedTransitionBoundary>;
}
