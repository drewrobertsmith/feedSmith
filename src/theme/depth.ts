import type { ViewStyle } from 'react-native';

import { palette, themes, type ThemeName } from '@/theme/tokens';

/**
 * How physical a control looks (FEE-74, D27), in Android's terms (D29): a tonal face a step off the
 * page and a soft shadow below it, stepped together on named levels, as Material 3's elevated chips and
 * buttons are. No light down the face and no top-edge sheen: Material lights no surface from above.
 * Chips and buttons are soft, the chosen chip raised, and a control under the
 * finger is pressed (with Android's ripple, from `rippleColor`). What's set into the page rather than
 * standing on it, the Pinned group's tray and the text fields, is inset (FEE-83): a face a step darker
 * than the page and the shadow reversed, a soft inner shadow from the top edge and none below.
 * Articles, rows and pages have none.
 * The only source of shadows in the app (Q19).
 */
export const DEPTH_LEVELS = ['soft', 'raised', 'pressed', 'inset'] as const;
export type DepthLevel = (typeof DEPTH_LEVELS)[number];

type Layers = {
  /** The control's own colour; its label reads on it at 4.5:1 (Q14, D26). */
  face: string;
  /**
   * A soft shadow: offset `y` and `blur` in points, and how dark (0–1). Below the control, or with
   * `inset`, inside it, falling from its top edge (FEE-83).
   */
  shadow: { y: number; blur: number; alpha: number; inset?: true };
};

/**
 * The shapes a face with depth takes (FEE-81): a pill or circle for what's pressed in passing (chips,
 * buttons), a card's `rounded-lg` corners for what holds a few lines (a site's feeds to choose from, the
 * text field's top edge).
 */
export const SHAPE_RADIUS = { round: 9999, card: 8 } as const;
export type DepthShape = keyof typeof SHAPE_RADIUS;

/** What a shadow is made of: black on Midnight, Midnight on cream. */
const SHADOW: Record<ThemeName, string> = { dark: palette.black, light: palette.midnight };
/** Material 3's pressed-state strength, for the ripple. */
const PRESSED_STATE = 0.1;

export const depth: Record<ThemeName, Record<DepthLevel, Layers>> = {
  dark: {
    soft: { face: palette.dusk, shadow: { y: 1, blur: 2, alpha: 0.45 } },
    raised: { face: palette.navy, shadow: { y: 3, blur: 8, alpha: 0.5 } },
    pressed: { face: palette.dusk, shadow: { y: 0, blur: 0, alpha: 0 } },
    inset: { face: palette.midnightDeep, shadow: { y: 2, blur: 4, alpha: 0.5, inset: true } },
  },
  light: {
    soft: { face: palette.paper, shadow: { y: 1, blur: 2, alpha: 0.16 } },
    raised: { face: palette.paperRaised, shadow: { y: 3, blur: 10, alpha: 0.24 } },
    pressed: { face: palette.sand, shadow: { y: 0, blur: 0, alpha: 0 } },
    // Sand, like pressed: on cream both are below the page; inset alone has the inner shadow (D34).
    inset: { face: palette.sand, shadow: { y: 2, blur: 4, alpha: 0.14, inset: true } },
  },
};

/** `#RRGGBB` at `alpha`, as React Native's styles take it. */
function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The style that puts a control at `level` in `scheme`: its face and its shadow, together. */
export function depthStyle(scheme: ThemeName, level: DepthLevel): ViewStyle {
  const { face, shadow } = depth[scheme][level];
  return {
    backgroundColor: face,
    boxShadow: [
      {
        offsetX: 0,
        offsetY: shadow.y,
        blurRadius: shadow.blur,
        color: withAlpha(SHADOW[scheme], shadow.alpha),
        ...(shadow.inset && { inset: true }),
      },
    ],
  };
}

/** Android's press ripple on a control with depth: the text colour at Material's pressed-state strength. */
export function rippleColor(scheme: ThemeName): string {
  return withAlpha(themes[scheme].text, PRESSED_STATE);
}
