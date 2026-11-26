/**
 * Whether new Articles are waiting above where you're reading (FEE-102). A fetch reaches the list
 * live; scrolled down, its new rows go in above you and wait there, and the note says so. No React,
 * no timers: the screen feeds it each list it shows and whether you're at the top.
 *
 * It holds no count, only whether something is waiting (P7).
 */
export type NewArticles = {
  /** The chip view these Articles belong to: All, or one Feed's id. */
  readonly view: string;
  /** The Articles last on screen, by id. */
  readonly shown: ReadonlySet<string>;
  readonly waiting: boolean;
};

/**
 * The state after the list shows `ids` in `view`. A new view, or a list filling an empty screen,
 * is a new list: nothing in it is new. Otherwise an id not shown before is new, and waits unless
 * you're at the top, where it's in view. Once waiting, it waits until you reach the top.
 */
export function update(state: NewArticles | null, view: string, ids: readonly string[], atTop: boolean): NewArticles {
  const shown = new Set(ids);
  if (state === null || state.view !== view || state.shown.size === 0) return { view, shown, waiting: false };
  const arrived = ids.some((id) => !state.shown.has(id));
  return { view, shown, waiting: !atTop && (state.waiting || arrived) };
}

/** You've reached the top, by the note or by scrolling: whatever was waiting is in view. */
export function reachTop(state: NewArticles): NewArticles {
  return state.waiting ? { ...state, waiting: false } : state;
}
