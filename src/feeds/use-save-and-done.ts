import { useUndo } from '@/components/undo-toast';
import { confirmHaptic } from '@/environment/haptics';
import { useSavedActions } from '@/feeds/feeds-data';

const SAID = { save: 'Saved.', done: 'Marked Done.' } as const;

/**
 * Save and Done (Q3, Q35): the change shows at once (the data layer is optimistic), the note
 * with Undo appears at once, and Undo puts back exactly what the server found. `haptic` is off
 * when a swipe already gave its own at the moment it committed.
 */
export function useSaveAndDone() {
  const { save, done, restore } = useSavedActions();
  const showUndo = useUndo();
  return (id: string, action: 'save' | 'done', { haptic = true }: { haptic?: boolean } = {}) => {
    if (haptic) confirmHaptic();
    const before = action === 'save' ? save(id) : done(id);
    showUndo(SAID[action], () => {
      void before.then((was) => (was ? restore(id, was) : undefined));
    });
  };
}
