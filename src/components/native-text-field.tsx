import { Host, Text, TextField, useNativeState, type TextFieldRef } from '@expo/ui/jetpack-compose';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useEffect, useRef, useState } from 'react';

import { useEnvironment } from '@/environment';
import { depth } from '@/theme/depth';
import { themes } from '@/theme/tokens';
import { typeScale } from '@/theme/type';

/**
 * How long after mounting the field asks for focus. The sheet's window takes focus only once it has
 * opened: asked sooner (or with `autoFocus`), the field shows as focused but the keyboard types
 * elsewhere. Measured on the Pixel_10 emulator (FEE-43); the system's sheet motion has no token.
 */
const FOCUS_AFTER_SHEET_OPENS_MS = 400;

/**
 * Android's own text field, Material 3's filled `TextField` (Compose, through Expo UI), for a field
 * inside a `NativeSheet`, where it's part of the sheet's own window (FEE-43): Add a Feed's one field,
 * for a website or feed address, with the URL keyboard, kept as typed, sent with Go (T21).
 *
 * Its label floats inside it. Its container is a tonal step off the sheet (the soft face, D27, with no
 * shadow), and the line along its bottom thickens and turns Gold while it has focus, with a Gold caret
 * and label, so focus shows in shape as well as colour (Q14, FEE-81). It takes focus once the sheet has
 * opened, with its text selected, so typing replaces it. Uncontrolled: it starts from `defaultValue` and
 * reports each change. Text in Literata (D6) at the world's font scale.
 */
export function NativeTextField({
  label,
  placeholder,
  defaultValue,
  onChangeText,
  onSubmitEditing,
  editable = true,
}: {
  /** Its floating label, which TalkBack hears too (Q15). */
  label: string;
  placeholder?: string;
  defaultValue: string;
  onChangeText: (text: string) => void;
  onSubmitEditing: () => void;
  /** False while what was typed is being sent (Adding…). */
  editable?: boolean;
}) {
  const { colorScheme, fontScale } = useEnvironment();
  const theme = themes[colorScheme];
  const container = depth[colorScheme].soft.face;
  const text = useNativeState(defaultValue);
  // What it started with, kept: the caller's value changes as the User types, and must not refocus it.
  const [startLength] = useState(defaultValue.length);
  const field = useRef<TextFieldRef>(null);
  useEffect(() => {
    const later = setTimeout(() => {
      // Whatever was there when the sheet opened is selected, so typing replaces it. Once only.
      void field.current?.focus().then(() => field.current?.setSelection(0, startLength));
    }, FOCUS_AFTER_SHEET_OPENS_MS);
    return () => clearTimeout(later);
  }, [startLength]);
  return (
    <Host matchContents={{ vertical: true }} style={{ width: '100%' }}>
      <TextField
        ref={field}
        value={text}
        onValueChange={onChangeText}
        enabled={editable}
        singleLine
        keyboardOptions={{ keyboardType: 'uri', capitalization: 'none', autoCorrectEnabled: false, imeAction: 'go' }}
        keyboardActions={{ onGo: onSubmitEditing }}
        modifiers={[fillMaxWidth()]}
        textSelectionColors={{ handleColor: theme.accent, backgroundColor: theme.indicator }}
        colors={{
          focusedContainerColor: container,
          unfocusedContainerColor: container,
          disabledContainerColor: container,
          focusedTextColor: theme.text,
          unfocusedTextColor: theme.text,
          disabledTextColor: theme.textMuted,
          cursorColor: theme.accent,
          focusedIndicatorColor: theme.accent,
          unfocusedIndicatorColor: theme.textMuted,
          disabledIndicatorColor: theme.textMuted,
          focusedLabelColor: theme.accent,
          unfocusedLabelColor: theme.textMuted,
          disabledLabelColor: theme.textMuted,
          focusedPlaceholderColor: theme.textMuted,
          unfocusedPlaceholderColor: theme.textMuted,
        }}
        textStyle={{
          color: theme.text,
          fontFamily: typeScale.reading.fontFamily,
          fontSize: typeScale.reading.fontSize * fontScale,
          lineHeight: typeScale.reading.lineHeight * fontScale,
        }}
      >
        {/* In the app's faces: the label's Instrument Sans, the placeholder in Literata like what's typed (D6). Material
            sizes the label itself, as it floats up. */}
        <TextField.Label>
          <Text style={{ fontFamily: typeScale.label.fontFamily }}>{label}</Text>
        </TextField.Label>
        {placeholder ? (
          <TextField.Placeholder>
            <Text style={{ fontFamily: typeScale.reading.fontFamily }}>{placeholder}</Text>
          </TextField.Placeholder>
        ) : null}
      </TextField>
    </Host>
  );
}
