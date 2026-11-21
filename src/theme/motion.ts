/**
 * Motion tokens (D7): motion appears on action, never while reading. A spring is
 * `{ damping, stiffness }` for React Native's Animated; "Remove animations" skips it (Q17).
 */
export const motion = {
  /** A chosen chip settles into place from slightly smaller: quick, with a little give. */
  chipSelect: { from: 0.9, damping: 11, stiffness: 320 },
} as const;
