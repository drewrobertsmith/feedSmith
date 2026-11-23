import type { SymbolViewProps } from 'expo-symbols';

import type { ArticleRow } from '@/feeds/feeds-data';

/** A row's one action besides opening it: Save, or Done once Saved (P11, P21). */
export type RowActionName = 'save' | 'done';

/** Everything each action looks and sounds like, in one place (D21). */
export const ROW_ACTIONS = {
  save: {
    label: 'Save',
    /** What the Undo note says once it's done (Q35). */
    said: 'Saved.',
    icon: { ios: 'bookmark', android: 'bookmark' },
    /** Gold: yours (D5). Its ink is the page's own background colour (Q14). */
    panel: 'bg-accent',
    ink: 'text-background',
  },
  done: {
    label: 'Done',
    said: 'Marked Done.',
    icon: { ios: 'checkmark', android: 'check' },
    /** No new colour (Q30): the surface, with the text colour. */
    panel: 'bg-surface',
    ink: 'text-text',
  },
} as const satisfies Record<
  RowActionName,
  { label: string; said: string; icon: SymbolViewProps['name']; panel: string; ink: string }
>;

/** What a row offers: Save, or Done once it's Saved. */
export const rowAction = (article: ArticleRow): RowActionName => (article.saved ? 'done' : 'save');
