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

/** A website or feed address: the URL keyboard, kept exactly as typed, sent with Go (T21). */
const ADDRESS = { keyboardType: 'url', autoCapitalize: 'none', autoCorrect: false, autoComplete: 'url', returnKeyType: 'go' } as const;

/**
 * Android's own text field (Compose, through Expo UI), for a field inside a `NativeSheet`, where
 * it's part of the sheet's own window (FEE-43): Add a Feed's one field, for a website or feed address.
 * It takes focus once the sheet has opened, with its text selected, so typing replaces it. Uncontrolled:
 * it starts from `defaultValue` and reports each change. Text in Literata (D6) at the world's font
 * scale; Android adds its own font size, as it does for symbols (D31).
 */
export function NativeTextField({
  label,
  placeholder,
  defaultValue,
  onChangeText,
  onSubmitEditing,
  editable = true,
  onFocus,
  onBlur,
}: {
  /** What TalkBack hears (Q15). */
  label: string;
  placeholder?: string;
  defaultValue: string;
  onChangeText: (text: string) => void;
  onSubmitEditing: () => void;
  /** False while what was typed is being sent (Adding…). */
  editable?: boolean;
  /** It has taken focus, or lost it: `DepthField` shows which (FEE-81). */
  onFocus?: () => void;
  onBlur?: () => void;
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
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        editable={editable}
        {...ADDRESS}
        // Whatever's there is selected, so typing replaces it; without it the cursor lands at the start.
        selectTextOnFocus
        // Gold, like the line under the field while it has focus (FEE-81, D5).
        cursorColor={theme.accent}
        selectionHandleColor={theme.text}
        // Clear, with no outline: its face and shadow are `DepthField`'s, around it (FEE-81). `px-group py-related` (Q24).
        style={{ paddingHorizontal: spacing.group, paddingVertical: spacing.related }}
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
