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
} as const;
