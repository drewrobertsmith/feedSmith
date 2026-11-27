import { Host } from '@expo/ui';
import { AlertDialog, Text, TextButton } from '@expo/ui/jetpack-compose';
import { StyleSheet } from 'react-native';

import { useEnvironment } from '@/environment';
import { themes } from '@/theme/tokens';

/**
 * Asking first, before something is destroyed for good (Q32): Material 3's own dialog (Compose's `AlertDialog`,
 * through Expo UI), so TalkBack reads its title, message and buttons as Android's (Q15). Its colours come from the
 * theme (Q19): the confirming button in brick, which means "destroys data" (D19), Cancel in the text colour (FEE-49).
 * Back, or a tap outside it, cancels. React Native's `Alert` couldn't colour one button apart from the other.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  /** The button that destroys, such as Remove or Delete. */
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const theme = themes[useEnvironment().colorScheme];
  if (!open) return null;

  return (
    // Fills the screen without catching touches; the dialog is a window of its own over everything.
    <Host style={StyleSheet.absoluteFill} pointerEvents="none">
      <AlertDialog
        onDismissRequest={onCancel}
        colors={{ containerColor: theme.surface, titleContentColor: theme.text, textContentColor: theme.textMuted }}
      >
        <AlertDialog.Title>
          <Text style={{ typography: 'headlineSmall' }}>{title}</Text>
        </AlertDialog.Title>
        <AlertDialog.Text>
          <Text style={{ typography: 'bodyMedium' }}>{message}</Text>
        </AlertDialog.Text>
        <AlertDialog.DismissButton>
          <TextButton onClick={onCancel} colors={{ contentColor: theme.text }}>
            <Text style={{ typography: 'labelLarge' }}>Cancel</Text>
          </TextButton>
        </AlertDialog.DismissButton>
        <AlertDialog.ConfirmButton>
          <TextButton onClick={onConfirm} colors={{ contentColor: theme.destructive }}>
            <Text style={{ typography: 'labelLarge' }}>{confirmLabel}</Text>
          </TextButton>
        </AlertDialog.ConfirmButton>
      </AlertDialog>
    </Host>
  );
}
