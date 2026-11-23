import { useState } from 'react';

import type { AllView, ArticleRow } from '@/feeds/feeds-data';

type Shown = { articles: ArticleRow[]; index: number };

/** The same rows, one by one: a source may build a new array around unchanged rows on every render. */
const sameRows = (a: ArticleRow[], b: ArticleRow[]) => a.length === b.length && a.every((row, i) => row === b[i]);

/**
 * The rows the list shows, and the chip they belong to (FEE-42). When another chip is chosen its
 * rows take a moment to load; until they're ready the last rows stay, so the list never blanks,
 * and the switch (with its slide) happens once, when the new rows arrive.
 */
export function useShownRows(view: AllView, index: number): Shown {
  const [shown, setShown] = useState<Shown>(() =>
    view.status === 'ready' ? { articles: view.articles, index } : { articles: [], index },
  );
  // Derived during render, as React recommends for adjusting state to new props.
  if (view.status === 'ready' && (index !== shown.index || !sameRows(view.articles, shown.articles))) {
    setShown({ articles: view.articles, index });
  }
  return view.status === 'ready' ? { articles: view.articles, index } : shown;
}
