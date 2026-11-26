import { Easing, Keyframe } from 'react-native-reanimated';

import { motion } from '@/theme/motion';

const { from, to, duration, exit, easing, exitEasing } = motion.newArticlesNote;

/**
 * How the New Articles pill comes and goes (FEE-118), as Material moves a small floating button: it grows in
 * from slightly smaller while fading in, and shrinks a little while fading out, quicker than it came, always
 * from its own centre, so it's never anywhere but where it sits.
 */
export const NOTE_ENTERING = new Keyframe({
  0: { opacity: 0, transform: [{ scale: from }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: Easing.bezier(...easing) },
}).duration(duration);

export const NOTE_EXITING = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }] },
  100: { opacity: 0, transform: [{ scale: to }], easing: Easing.bezier(...exitEasing) },
}).duration(exit);
