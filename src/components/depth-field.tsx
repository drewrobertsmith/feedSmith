import { useState, type ComponentProps } from 'react';
import { View } from 'react-native';

import { NativeTextField } from '@/components/native-text-field';
import { useEnvironment } from '@/environment';
import { depthStyle, SHAPE_RADIUS } from '@/theme/depth';
import { themes } from '@/theme/tokens';

/** How thick the line under the field is: a hairline at rest, doubled while it has focus. */
const LINE = { rest: 1, focused: 2 } as const;

/**
 * A text field set into the page (FEE-81, D34): Android's own field on an **inset** face, its top
 * corners a card's and its bottom edge a line, as Material 3's filled field is. While it has focus the
 * line thickens and turns Gold, with a Gold caret, so focus shows in shape, not colour alone (Q14);
 * losing focus puts it back. Its look comes only from the depth scale and the tokens (Q19).
 */
export function DepthField(props: Omit<ComponentProps<typeof NativeTextField>, 'onFocus' | 'onBlur'>) {
  const { colorScheme } = useEnvironment();
  const theme = themes[colorScheme];
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={[
        depthStyle(colorScheme, 'inset'),
        { borderTopLeftRadius: SHAPE_RADIUS.card, borderTopRightRadius: SHAPE_RADIUS.card, overflow: 'hidden' },
      ]}
    >
      <NativeTextField {...props} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
      <View
        testID="field-indicator"
        pointerEvents="none"
        className="absolute bottom-0 left-0 right-0"
        style={{
          height: focused ? LINE.focused : LINE.rest,
          backgroundColor: focused ? theme.accent : theme.textMuted,
        }}
      />
    </View>
  );
}
