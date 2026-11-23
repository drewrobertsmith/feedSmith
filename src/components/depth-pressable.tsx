import { createContext, use, useState, type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { useEnvironment } from '@/environment';
import { depth, depthStyle, type DepthLevel } from '@/theme/depth';

/** The face colour of the control something is drawn on, so it can ring itself in that colour (D25). */
const ControlFace = createContext<string | undefined>(undefined);

/** The face colour of the control around this one, if it sits on one. */
export function useControlFace(): string | undefined {
  return use(ControlFace);
}

/**
 * A pressable control with depth (D27): at its `level` at rest, and pressed, flat and sunk, while
 * the finger is down. Pressing is tracked here, through `onPressIn` and `onPressOut`, rather than
 * Pressable's internal state, so tests can see it; a press that turns into a scroll still ends with
 * `onPressOut`. The face colour is shared with what's drawn on the control.
 */
export function DepthPressable({
  level,
  style,
  onPressIn,
  onPressOut,
  children,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & {
  /** How it sits at rest: soft for buttons and chips, raised for the chosen chip (D27). */
  level: Exclude<DepthLevel, 'pressed'>;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const { colorScheme } = useEnvironment();
  const [pressed, setPressed] = useState(false);
  const shown: DepthLevel = pressed ? 'pressed' : level;
  return (
    <Pressable
      {...props}
      onPressIn={(event) => {
        setPressed(true);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        onPressOut?.(event);
      }}
      style={[depthStyle(colorScheme, shown), style]}
    >
      <ControlFace value={depth[colorScheme][shown].face}>{children}</ControlFace>
    </Pressable>
  );
}
