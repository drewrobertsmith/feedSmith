/**
 * Motion tokens (D7): motion appears on action, never while reading. A spring is
 * `{ damping, stiffness }` for React Native's Animated; "Remove animations" skips it (Q17).
 */
export const motion = {
  /** A chosen chip settles into place from slightly smaller: quick, with a little give. */
  chipSelect: { from: 0.9, damping: 11, stiffness: 320 },
  /**
   * A dragged row lifts and settles into its gap without bounce: a smooth spring, just past
   * critically damped (Reanimated's withSpring config). Reordering is occasional; the drop is calm.
   */
  rowLift: { damping: 30, stiffness: 200 },
  /**
   * The other rows step aside for a dragged one: a quick timed move on the fast-start, gentle-settle
   * curve, so they follow the finger without wobble. `easing` is a cubic-bezier's control points.
   */
  rowMakeRoom: { duration: 250, easing: [0.16, 1, 0.3, 1] },
  /**
   * Choosing another chip slides the list's rows in from that side, a short way and a little
   * faded, on the fast-start, gentle-settle curve (FEE-42). The header stays still.
   */
  chipSwitch: { distance: 24, duration: 200, fadeFrom: 0.6, easing: [0.16, 1, 0.3, 1] },
  /**
   * The Pinned group opening and folding (FEE-60), tapped as often as any chip, so quiet, and never
   * two things in one place. Opening: the chips after the group make room at once, and the Pinned
   * Feeds' chips fade in `delay` later, travelling `distance` out from the Pinned chip, into space
   * already opened. Folding: they fade back toward it over `exit`, and only then does the row close
   * up. One curve, the fast-start, gentle-settle one; no scale, no bounce. About 260 ms each way.
   */
  groupReveal: { distance: 8, delay: 60, duration: 200, exit: 90, easing: [0.16, 1, 0.3, 1] },
  /**
   * Opening an Article (FEE-48): the row's title box travels into the headline's place in `duration`, on
   * Material's emphasized curve. The row's words fade over the whole way (`fadeOutEnd` 1: an earlier end left
   * the box travelling empty, seen frame by frame), and the headline's fade in over `fadeIn` as it lands.
   * Short enough to stay inside the 300 ms tap-to-text budget.
   */
  articleOpen: { duration: 300, easing: [0.2, 0, 0, 1], fadeOutEnd: 1, fadeIn: 150 },
  /**
   * A Feed found by name arrives in Add a Feed (FEE-80): it fades in, rising `distance` into its
   * place, while the rows after it make room on the same curve, so nothing jumps. A search brings a
   * handful at most, so quiet: no scale, no bounce.
   */
  resultArrive: { distance: 8, duration: 200, easing: [0.16, 1, 0.3, 1] },
} as const;
