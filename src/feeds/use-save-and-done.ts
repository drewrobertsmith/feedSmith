import { ROW_ACTIONS, type RowActionName } from '@/components/row-action';
import { useUndo } from '@/components/undo-toast';
import { confirmHaptic } from '@/environment/haptics';
import { useSavedActions } from '@/feeds/feeds-data';

/**
 * Save and Done (Q3, Q35): the change shows at once (the data layer is optimistic), the note
 * with Undo appears at once, and Undo puts back exactly what the server found. `haptic` is off
 * when a swipe already gave its own at the moment it committed.
 */
export function useSaveAndDone() {
  const { save, done, restore } = useSavedActions();
  const showUndo = useUndo();
  return (id: string, action: RowActionName, { haptic = true }: { haptic?: boolean } = {}) => {
    if (haptic) confirmHaptic();
    const before = action === 'save' ? save(id) : done(id);
    showUndo(ROW_ACTIONS[action].said, () => {
      void before.then((was) => (was ? restore(id, was) : undefined));
    });
  };
}
