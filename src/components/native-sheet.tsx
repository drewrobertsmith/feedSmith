import { BottomSheet, RNHostView } from '@expo/ui';
import type { ReactElement } from 'react';

import { useEnvironment } from '@/environment';
import { themes } from '@/theme/tokens';

/**
 * Android's own bottom sheet (Material 3, through Expo UI), holding React Native content: for
 * quick tasks over the current screen (Q32). It closes on a swipe down, a tap outside or back,
 * and predictive back closes it before the screen under it (Q18). Its motion is the system's,
 * so "Remove animations" turns it off with every other system animation (Q17).
 */
export function NativeSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactElement }) {
  const { colorScheme } = useEnvironment();
  return (
    <BottomSheet isPresented={open} onDismiss={onClose} containerColor={themes[colorScheme].surface} contentPadding={0}>
      <RNHostView matchContents>{children}</RNHostView>
    </BottomSheet>
  );
}
