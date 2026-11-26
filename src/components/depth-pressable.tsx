import { createContext, use, useState, type ReactNode } from 'react';
import { Pressable, View, type GestureResponderEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { useEnvironment } from '@/environment';
import { depth, depthStyle, rippleColor, SHAPE_RADIUS, type DepthLevel, type DepthShape } from '@/theme/depth';

/** The face colour of the control something is drawn on, so it can ring itself in that colour (D25). */
const ControlFace = createContext<string | undefined>(undefined);

/** The face colour of the control around this one, if it sits on one. */
export function useControlFace(): string | undefined {
  return use(ControlFace);
}

/**
 * A pressable control with depth (D27), in Android's terms (D29): a face of its `shape` (a pill unless
 * it's a `card`, FEE-81) at its `level` at rest, sinking to pressed, flat, while the finger is down, with Android's ripple over the face.
 *
 * Three layers, because Android draws a ripple as the pressable's own square drawable, and only a
 * clipping parent rounds it, while a clipping parent also cuts off any touch area beyond its edge:
 * - the control: a pressable that doesn't clip, holding the role, label, hit slop (Q15) and handlers,
 *   and placed by `frameClassName` (`self-start`);
 * - the face: a rounded view drawing the level's face and shadow, clipping what's inside (its own
 *   shadow is drawn outside it, so the clip keeps it);
 * - the ripple: a pressable inside the face, laid out by `className` and `style`, hidden from TalkBack,
 *   with the same handlers, so a touch on the face ripples and a touch in the slop still counts.
 *
 * Pressing is tracked here, through `onPressIn` and `onPressOut`, rather than Pressable's internal
 * state, so tests can see it; a press that turns into a scroll still ends with `onPressOut`. The face
 * colour is shared with what's drawn on the control (`useControlFace`).
 */
export function DepthPressable({
  level,
  shape = 'round',
  frameClassName,
  className,
  style,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  disabled,
  children,
  ...props
}: Omit<PressableProps, 'style' | 'children'> & {
  /** How it sits at rest: soft for buttons and chips, raised for the chosen chip (D27). */
  level: Exclude<DepthLevel, 'pressed'>;
  /** A pill or circle (`round`), or a card's corners for a control holding a few lines. */
  shape?: DepthShape;
  /** Classes placing the control in its parent, such as `self-start`. */
  frameClassName?: string;
  /** Classes laying out the control's content inside its face. */
  className?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const { colorScheme } = useEnvironment();
  const [pressed, setPressed] = useState(false);
  const shown: DepthLevel = pressed ? 'pressed' : level;
  const handlers = {
    onPress,
    onLongPress,
    disabled,
    onPressIn: (event: GestureResponderEvent) => {
      setPressed(true);
      onPressIn?.(event);
    },
    onPressOut: (event: GestureResponderEvent) => {
      setPressed(false);
      onPressOut?.(event);
    },
  };
  return (
    <Pressable {...props} {...handlers} className={frameClassName}>
      <View style={[depthStyle(colorScheme, shown), { borderRadius: SHAPE_RADIUS[shape], overflow: 'hidden' }]}>
        <Pressable
          {...handlers}
          accessible={false}
          android_ripple={{ color: rippleColor(colorScheme), borderless: false }}
          className={className}
          style={style}
        >
          <ControlFace value={depth[colorScheme][shown].face}>{children}</ControlFace>
        </Pressable>
      </View>
    </Pressable>
  );
}
