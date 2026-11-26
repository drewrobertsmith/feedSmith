import type { ArticleRow } from '@/feeds/feeds-data';
import type { Rect } from '@/navigation/container-transform';

/** Where a row is on screen, and its thumbnail when it has one, in window coordinates. */
export type RowPlace = { row: Rect; thumb?: Rect };
/** The row an Article was opened from (FEE-114): its place, and what it showed, for the Reading view to grow from. */
export type Origin = RowPlace & { article: ArticleRow; feedNamed: boolean };

/** The rows in the lists now, by Article id: each measures itself. Rows leave as they unmount (Q20). */
const rows = new Map<string, () => RowPlace | undefined>();
/** The last row tapped: one at most, replaced by the next tap and forgotten when its Article closes (Q20). */
let last: Origin | undefined;

/** A row joins while it's mounted, so going back can find it where it is now. */
export function registerRow(id: string, measure: () => RowPlace | undefined): () => void {
  rows.set(id, measure);
  return () => {
    if (rows.get(id) === measure) rows.delete(id);
  };
}

/** Where the row for this Article is now, or undefined when it's gone or not laid out. */
export function measureRow(id: string): RowPlace | undefined {
  const place = rows.get(id)?.();
  return place && place.row.width > 0 && place.row.height > 0 ? place : undefined;
}

/** Called as a row is tapped, before the Reading view opens. */
export function recordOrigin(article: ArticleRow, feedNamed: boolean) {
  const place = measureRow(article.id);
  last = place ? { ...place, article, feedNamed } : undefined;
}

export function getOrigin(id: string): Origin | undefined {
  return last?.article.id === id ? last : undefined;
}

export function clearOrigin(id: string) {
  if (last?.article.id === id) last = undefined;
}
