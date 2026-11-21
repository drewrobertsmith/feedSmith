/**
 * The spacing scale (D9): an 8-point grid, named by relationship. The closer two things
 * are related, the closer they sit, and the space between two things is never smaller
 * than the space inside either of them. `src/global.css` offers the same steps to Uniwind
 * (`gap-related`, `px-edge`…), and a test keeps the two in step.
 */
export const spacing = {
  /** Parts of one element: an icon and its label, a chip's padding. The only 4-point step. */
  inside: 4,
  /** Items in one group: a title and its subtitle, chips in a row. */
  related: 8,
  /** Separate groups on a screen. */
  group: 16,
  /** Major sections. */
  section: 32,
  /** The screen's side margins. */
  edge: 16,
} as const;
