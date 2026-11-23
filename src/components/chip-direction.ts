/**
 * Which way the list slides when the chosen chip changes (FEE-42): 1 when the new chip is to
 * the right (the list comes in from the right), -1 to the left, 0 for no move at all (the same
 * chip, the list's first showing, or a chip that's gone).
 */
export function chipDirection(from: number | null, to: number): -1 | 0 | 1 {
  if (from === null || from < 0 || to < 0 || from === to) return 0;
  return to > from ? 1 : -1;
}
