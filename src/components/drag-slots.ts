/**
 * Where a held row lands in a short reorderable list, and where every row sits in the order a
 * drag makes (D13). Pure worklets: they run on the UI thread during a drag, and in tests as plain functions.
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

/** `order` with the row at `from` taken out and put back at `to`. */
export function moved(order: readonly string[], from: number, to: number): string[] {
  'worklet';
  const next = order.slice();
  const [id] = next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}

/** Where row `id` sits in `order`: the rows above it, each with the gap after it. Unmeasured rows take no room. */
export function slotTop(order: readonly string[], heights: Readonly<Record<string, number>>, gap: number, id: string) {
  'worklet';
  let top = 0;
  for (const other of order) {
    if (other === id) return top;
    top += (heights[other] ?? 0) + gap;
  }
  return top;
}

/** How tall the list is: its rows and the gaps between them. */
export function totalHeight(order: readonly string[], heights: Readonly<Record<string, number>>, gap: number) {
  'worklet';
  let total = 0;
  order.forEach((id, i) => {
    total += (heights[id] ?? 0) + (i === 0 ? 0 : gap);
  });
  return total;
}
