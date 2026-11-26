import { useState } from 'react';

import { publishedAgo } from '@/feeds/format';

type Pull =
  | { phase: 'idle' }
  | { phase: 'pulling' }
  /** The pull answered with the newest fetch it recorded; `seen` is the line's time when the answer came. */
  | { phase: 'catching-up'; until: number; seen?: number | null };

/**
 * Pulling down (P15), held until its results are on screen (FEE-103). `run` fetches every Feed and answers
 * with the newest fetch it recorded (null if it fetched none); `at` is when the "Updated" line says All was
 * last updated. A fetch's rows and time reach the app together, so once `at` has caught up with the answer,
 * the rows are in: only then does "Updating…" end, turning straight into "Updated just now". If `at` moves
 * any other way meanwhile (a Feed removed mid-pull), the pull ends too, so it can never stick.
 */
export function usePull(run: () => Promise<number | null>, at: number | null | undefined) {
  const [pull, setPull] = useState<Pull>({ phase: 'idle' });
  // Derived during render, as React recommends for adjusting state to new props (as `useShownRows` does).
  if (pull.phase === 'catching-up') {
    if (pull.seen === undefined) setPull({ ...pull, seen: at ?? null });
    else if ((at ?? 0) >= pull.until || (at ?? null) !== pull.seen) setPull({ phase: 'idle' });
  }
  const caughtUp = pull.phase === 'catching-up' && (at ?? 0) >= pull.until;
  const refreshing = pull.phase === 'pulling' || (pull.phase === 'catching-up' && !caughtUp);

  const refresh = async () => {
    setPull({ phase: 'pulling' });
    const until = await run();
    setPull(until === null ? { phase: 'idle' } : { phase: 'catching-up', until });
  };
  return { refreshing, refresh };
}

/**
 * The "Updated" line's parts (FEE-104): `still` ("Updated", or "Updating…" during a pull) and the `time` as
 * it ages. Split after the word, so the time changes while "Updated" stays put, and the line keeps its kerning.
 */
export type UpdatedLine = { still: 'Updated' | 'Updating…'; time: string };

/** The line under the Feeds title (D20): how fresh All is, or that it's updating. Nothing until there's something to say. */
export function updatedLine(refreshing: boolean, at: number | null | undefined, now: number): UpdatedLine | undefined {
  if (refreshing) return { still: 'Updating…', time: '' };
  if (at === null || at === undefined) return undefined;
  return { still: 'Updated', time: ` ${publishedAgo(at, now)}` };
}
