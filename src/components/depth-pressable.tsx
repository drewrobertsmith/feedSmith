import { createContext, use, useState, type ReactNode } from 'react';
import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { useEnvironment } from '@/environment';
import { depth, depthStyle, rippleColor, type DepthLevel } from '@/theme/depth';

/** The face colour of the control something is drawn on, so it can ring itself in that colour (D25). */
const ControlFace = createContext<string | undefined>(undefined);

/** The face colour of the control around this one, if it sits on one. */
export function useControlFace(): string | undefined {
  return use(ControlFace);
}

/** Every control with depth is a pill or a circle, so its face is fully rounded. */
const ROUND = 9999;

/**
 * A pressable control with depth (D27), in Android's terms (D29): a rounded face at its `level` at
 * rest, sinking to pressed, flat, while the finger is down, with Android's ripple over the face.
 *
 * The face and its shadow are drawn by a rounded frame that clips what's inside it, because Android
 * draws a ripple as the pressable's own drawable, square, and no style on the pressable itself rounds
 * it; the frame's own shadow is drawn outside it, so the clip keeps it. `frameClassName` places the
 * frame (`self-start`); `className` and `style` lay out the pressable and its content.
 *
 * Pressing is tracked here, through `onPressIn` and `onPressOut`, rather than Pressable's internal
 * state, so tests can see it; a press that turns into a scroll still ends with `onPressOut`. The face
 * colour is shared with what's drawn on the control (`useControlFace`).
 */
export function DepthPressable({
  level,
  frameClassName,
  style,
  onPressIn,
  onPressOut,
  children,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & {
  /** How it sits at rest: soft for buttons and chips, raised for the chosen chip (D27). */
  level: Exclude<DepthLevel, 'pressed'>;
  /** Classes for the frame around the control, such as where it sits in its parent. */
  frameClassName?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const { colorScheme } = useEnvironment();
  const [pressed, setPressed] = useState(false);
  const shown: DepthLevel = pressed ? 'pressed' : level;
  return (
    <View className={frameClassName} style={[depthStyle(colorScheme, shown), { borderRadius: ROUND, overflow: 'hidden' }]}>
      <Pressable
        {...props}
        android_ripple={{ color: rippleColor(colorScheme), borderless: false }}
        onPressIn={(event) => {
          setPressed(true);
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          setPressed(false);
          onPressOut?.(event);
        }}
        style={style}
      >
        <ControlFace value={depth[colorScheme][shown].face}>{children}</ControlFace>
      </Pressable>
    </View>
  );
}
