/**
 * Motion tokens (D7): motion appears on action, never while reading. A spring is
 * `{ damping, stiffness }` for React Native's Animated; "Remove animations" skips it (Q17).
 */
export const motion = {
  /** A chosen chip settles into place from slightly smaller: quick, with a little give. */
  chipSelect: { from: 0.9, damping: 11, stiffness: 320 },
  /**
   * Choosing another chip slides the list's rows in from that side, a short way and a little
   * faded, on the fast-start, gentle-settle curve (FEE-42). The header stays still.
   */
  chipSwitch: { distance: 24, duration: 200, fadeFrom: 0.6, easing: [0.16, 1, 0.3, 1] },
  /**
   * Opening an Article (FEE-48): the row's title box travels into the headline's place in `duration`, on
   * Material's emphasized curve. The row's words fade over the whole way (`fadeOutEnd` 1: an earlier end left
   * the box travelling empty, seen frame by frame), and the headline's fade in over `fadeIn` as it lands.
   * Short enough to stay inside the 300 ms tap-to-text budget.
   */
  articleOpen: { duration: 300, easing: [0.2, 0, 0, 1], fadeOutEnd: 1, fadeIn: 150 },
} as const;
