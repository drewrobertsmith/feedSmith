import { Host, RNHostView } from '@expo/ui';
import { ModalBottomSheet, type ModalBottomSheetRef } from '@expo/ui/jetpack-compose';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { StyleSheet } from 'react-native';

import { useEnvironment } from '@/environment';
import { themes } from '@/theme/tokens';

/**
 * Android's own bottom sheet (Material 3's `ModalBottomSheet`, through Expo UI's Compose layer),
 * holding React Native content: for quick tasks over the current screen (Q32). It closes on a swipe
 * down, a tap outside or back, and predictive back closes it before the screen under it (Q18). Its
 * motion is the system's, so "Remove animations" turns it off with every other system animation (Q17).
 *
 * It opens as tall as its content, never stopping half-way: a tall sheet (a site's feeds at the
 * largest font, FEE-45) would otherwise open half-open with its action out of sight. Expo UI's
 * universal sheet can't ask for that without also filling the screen, hence the Compose layer.
 */
export function NativeSheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactElement }) {
  const { colorScheme } = useEnvironment();
  const sheet = useRef<ModalBottomSheetRef>(null);
  // Stays mounted while it slides away, as Expo UI's own sheet does, and unmounts once it's gone.
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);
  useEffect(() => {
    if (open) return;
    let cancelled = false;
    void sheet.current?.hide().then(() => {
      if (!cancelled) setMounted(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);
  if (!mounted) return null;

  return (
    // Fills the screen without catching touches, so the screen under it keeps its own.
    <Host style={StyleSheet.absoluteFill} pointerEvents="none">
      <ModalBottomSheet
        ref={sheet}
        onDismissRequest={onClose}
        skipPartiallyExpanded
        containerColor={themes[colorScheme].surface}
      >
        {/* Full width from the sheet, height from the content, so rows and the divider reach its edges. */}
        <RNHostView matchContents={{ vertical: true }}>{children}</RNHostView>
      </ModalBottomSheet>
    </Host>
  );
}
