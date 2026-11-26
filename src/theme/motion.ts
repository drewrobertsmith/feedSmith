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
   * Opening an Article (FEE-114): the tapped row grows into the page, Material's container transform, in
   * `duration` on Material's emphasized curve, and shrinks back into it in `close`. The row's content fades
   * out by `fadeThrough` of the way, and only then does the page's fade in, rising `rise` points; the list
   * dims under a scrim of black at `scrim`. Opening stays inside the 300 ms tap-to-text budget.
   */
  articleOpen: { duration: 300, close: 250, easing: [0.2, 0, 0, 1], fadeThrough: 0.35, rise: 8, scrim: 0.32 },
  /**
   * With no row to grow from (an Article opened from a link) or to go back into (scrolled away, or gone),
   * the page comes and goes on Material's shared axis Z: a fade, from or to slightly smaller (FEE-114).
   */
  articleAxis: { scale: 0.92, duration: 250, close: 200 },
  /**
   * Android's predictive back on a page (FEE-114), as Material draws it: at the end of the gesture the
   * page is `scale` of its size, rounded by `radius`, and leans `width / 20 - inset` away from the edge.
   * Cancelling springs it back with no overshoot.
   */
  predictiveBack: { scale: 0.9, inset: 8, radius: 28, cancel: { duration: 250, dampingRatio: 1 } },
  /**
   * The New Articles note (FEE-102) arrives because something did: it fades in, dropping a short way
   * from where the new Articles are, on Material's emphasized-decelerate curve, and fades out quicker
   * when you reach them.
   */
  newArticlesNote: { distance: 8, duration: 200, exit: 150, easing: [0.05, 0.7, 0.1, 1] },
  /**
   * New Articles arriving at the top of Feeds (FEE-104): the rows below ease down together on Material's
   * emphasized curve, then, once the space is open, the new rows fade in where they live, so nothing ever
   * shares a place.
   */
  rowsArrive: { duration: 300, easing: [0.2, 0, 0, 1], fadeIn: 150 },
  /**
   * The "Updated" line, in the same moment (FEE-104): only the part whose words change moves, the old words
   * fading out fully before the new ones fade in, so two never share a place.
   */
  lineChange: { out: 100, in: 150 },
} as const;
