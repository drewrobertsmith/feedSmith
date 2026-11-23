import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

/** Any rendered element from the testing library: its props, and the element around it. */
type Element = { props: { style?: StyleProp<ViewStyle> }; parent: Element | null };

/**
 * The face of the control `element` belongs to: the nearest view, from it outwards, that draws a
 * shadow. A control's face is its rounded frame, which clips Android's ripple (D29).
 */
export function faceOf(element: Element): ViewStyle | undefined {
  for (let node: Element | null = element; node; node = node.parent) {
    const style = StyleSheet.flatten(node.props.style);
    if (style?.boxShadow) return style;
  }
  return undefined;
}
