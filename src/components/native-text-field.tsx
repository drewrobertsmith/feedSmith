import { Host, TextInput, type TextInputRef } from '@expo/ui';
import { useEffect, useRef } from 'react';

import { useEnvironment } from '@/environment';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';
import { typeScale } from '@/theme/type';

/**
 * How long after mounting the field asks for focus. The sheet's window takes focus only once it has
 * opened: asked sooner (or with `autoFocus`), the field shows as focused but the keyboard types
 * elsewhere. Measured on the Pixel_10 emulator (FEE-43); the system's sheet motion has no token.
 */
const FOCUS_AFTER_SHEET_OPENS_MS = 400;

/**
 * Android's own text field (Compose, through Expo UI), for a field inside a `NativeSheet`, where
 * it's part of the sheet's own window (FEE-43). It takes focus once the sheet has opened, with its
 * text selected, so typing replaces it, as Android's own rename dialogs do. Uncontrolled: it starts
 * from `defaultValue` and reports each change. Text in Literata (D6) at the world's font scale;
 * Android adds its own font size, as it does for symbols (D31).
 */
export function NativeTextField({
  label,
  defaultValue,
  onChangeText,
  onSubmitEditing,
  maxLength,
}: {
  /** What TalkBack hears (Q15). */
  label: string;
  defaultValue: string;
  onChangeText: (text: string) => void;
  onSubmitEditing: () => void;
  maxLength: number;
}) {
  const { colorScheme, fontScale } = useEnvironment();
  const theme = themes[colorScheme];
  const field = useRef<TextInputRef>(null);
  useEffect(() => {
    const later = setTimeout(() => field.current?.focus(), FOCUS_AFTER_SHEET_OPENS_MS);
    return () => clearTimeout(later);
  }, []);
  return (
    <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
      <TextInput
        ref={field}
        accessibilityLabel={label}
        defaultValue={defaultValue}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        maxLength={maxLength}
        returnKeyType="done"
        autoCapitalize="words"
        selectTextOnFocus
        cursorColor={theme.text}
        selectionHandleColor={theme.text}
        // As the field it replaces: outlined in muted text, `rounded-lg`, `px-group py-related` (Q24).
        // On Android a rounded border is the border colour filled, with the background laid inside it,
        // so the sheet's surface (NativeSheet's) has to be given, or the field reads as a solid block.
        style={{
          backgroundColor: theme.surface,
          borderWidth: 1,
          borderColor: theme.textMuted,
          borderRadius: 8,
          paddingHorizontal: spacing.group,
          paddingVertical: spacing.related,
        }}
        textStyle={{
          color: theme.text,
          fontFamily: typeScale.reading.fontFamily,
          fontSize: typeScale.reading.fontSize * fontScale,
          lineHeight: typeScale.reading.lineHeight * fontScale,
        }}
      />
    </Host>
  );
}
