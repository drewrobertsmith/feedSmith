import type { AccessibilityActionEvent } from 'react-native';

/**
 * What TalkBack hears of a drag handle (Q15): a control to adjust, "Reorder The Verge, 2 of 3",
 * whose Move up and Move down actions (or swiping up and down on it) do what dragging does.
 * Kept apart from the drag gesture so tests, which can't run it (FEE-33), use the same props.
 */
export function reorderHandleProps({
  index,
  count,
  label,
  onDrop,
}: {
  index: number;
  count: number;
  label: string;
  onDrop: (to: number) => void;
}) {
  return {
    accessible: true,
    // ARIA's `role` has no slider-like value for this; the legacy role gives TalkBack's adjust gestures.
    accessibilityRole: 'adjustable' as const,
    'aria-label': label,
    accessibilityValue: { text: `${index + 1} of ${count}` },
    accessibilityActions: [
      ...(index > 0 ? [{ name: 'increment', label: 'Move up' }] : []),
      ...(index < count - 1 ? [{ name: 'decrement', label: 'Move down' }] : []),
    ],
    onAccessibilityAction: (event: AccessibilityActionEvent) => {
      if (event.nativeEvent.actionName === 'increment' && index > 0) onDrop(index - 1);
      if (event.nativeEvent.actionName === 'decrement' && index < count - 1) onDrop(index + 1);
    },
  };
}
