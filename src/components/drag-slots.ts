/**
 * Where a held row lands in a short reorderable list, and how far the others move to make room
 * (D13). Pure worklets: they run on the UI thread during a drag, and in tests as plain functions.
 * Rows can differ in height, so every step uses the measured height of the row being passed.
 */

/**
 * The slot a row held at `from` and moved `by` pixels would drop into, and how far it travels to
 * sit there (`settle`). It passes a neighbour once it's over more than half of it.
 */
export function slotFor(from: number, by: number, heights: readonly number[], gap: number, count: number) {
  'worklet';
  let to = from;
  let travelled = 0;
  const direction = by > 0 ? 1 : -1;
  while (to + direction >= 0 && to + direction < count) {
    const next = heights[to + direction];
    if (next === undefined) break;
    const step = next + gap;
    if (Math.abs(by) < travelled + step / 2) break;
    travelled += step;
    to += direction;
  }
  return { to, settle: travelled * direction };
}

/** How far `row` slides while the row at `held` (or -1, none) is moved `by`: one held row's height, or not at all. */
export function shiftFor(row: number, held: number, by: number, heights: readonly number[], gap: number, count: number) {
  'worklet';
  if (held < 0 || row === held) return 0;
  const { to } = slotFor(held, by, heights, gap, count);
  const room = (heights[held] ?? 0) + gap;
  if (held < row && row <= to) return -room;
  if (to <= row && row < held) return room;
  return 0;
}
