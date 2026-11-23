import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

/** Any rendered element from the testing library: its props, the element around it and those inside it. */
type Element = { props: { style?: StyleProp<ViewStyle> }; parent: Element | null; children: (Element | string)[] };

const shadowOf = (node: Element) => {
  const style = StyleSheet.flatten(node.props.style);
  return style?.boxShadow ? style : undefined;
};

/**
 * The face of the control `element` belongs to: the view that draws its shadow. A control's face sits
 * inside it (a `DepthPressable`, D29) or is the element itself or one around it (the Undo note).
 */
export function faceOf(element: Element): ViewStyle | undefined {
  const inside = [element];
  while (inside.length) {
    const node = inside.shift()!;
    const face = shadowOf(node);
    if (face) return face;
    inside.push(...node.children.filter((child): child is Element => typeof child !== 'string'));
  }
  for (let node = element.parent; node; node = node.parent) {
    const face = shadowOf(node);
    if (face) return face;
  }
  return undefined;
}
