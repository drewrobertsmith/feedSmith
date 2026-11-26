import { useState } from 'react';

import type { ArticleRow } from '@/feeds/feeds-data';
import { reachTop, update, type NewArticles } from '@/feeds/new-articles';

type Tracked = { state: NewArticles; articles: ArticleRow[]; atTop: boolean };

/**
 * Whether new Articles are waiting above you (FEE-102), for the list the screen shows in `view`
 * (All, or one Feed's id) and whether you're at the top. `clear` is for going to the top by the note.
 */
export function useNewArticles(view: string, articles: ArticleRow[], atTop: boolean) {
  const [tracked, setTracked] = useState<Tracked>(() => ({
    state: update(null, view, articles.map((row) => row.id), atTop),
    articles,
    atTop,
  }));
  // Derived during render, as React recommends for adjusting state to new props (as `useShownRows` does).
  if (articles !== tracked.articles || view !== tracked.state.view) {
    setTracked({ state: update(tracked.state, view, articles.map((row) => row.id), atTop), articles, atTop });
  } else if (atTop !== tracked.atTop) {
    setTracked({ state: atTop ? reachTop(tracked.state) : tracked.state, articles, atTop });
  }
  const clear = () => setTracked((current) => ({ ...current, state: reachTop(current.state) }));
  return { waiting: tracked.state.waiting, clear };
}
