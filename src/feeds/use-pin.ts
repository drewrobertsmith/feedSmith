import { useUndo } from '@/components/undo-toast';
import { useRestorePin, useSetPinned } from '@/feeds/feeds-data';

const PINS_FULL = 'You can Pin up to 3 Feeds. Unpin one first.';

/**
 * Pin and Unpin (P9) at once, with Undo (Q35): Undo unpins a new Pin, and puts an Unpinned Feed
 * back in its old place among the Pins. A fourth Pin is refused with a note saying why, and
 * nothing to undo.
 */
export function usePin() {
  const setPinned = useSetPinned();
  const restorePin = useRestorePin();
  const show = useUndo();
  return async (feed: { id: string; title: string; pinned: boolean }) => {
    const pinning = !feed.pinned;
    const result = await setPinned(feed.id, pinning);
    if (result.outcome === 'pins-full') {
      show(PINS_FULL);
      return;
    }
    if (result.outcome !== 'ok') return;
    show(`${pinning ? 'Pinned' : 'Unpinned'} ${feed.title}.`, () => {
      // Back where it was; with no place known, last among the Pins.
      void (pinning ? setPinned(feed.id, false) : restorePin(feed.id, result.place));
    });
  };
}
