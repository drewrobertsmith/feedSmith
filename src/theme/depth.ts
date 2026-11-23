import type { ViewStyle } from 'react-native';

import { palette, type ThemeName } from '@/theme/tokens';

/**
 * How physical a control looks (FEE-74, D27), after Drawesome's depth: its face, the light down that
 * face, the sheen on its top edge and its shadow, all stepped together, never one tuned on its own.
 * Each kind of control has its level: chips and buttons are soft, the chosen chip is raised, and
 * a control under the finger is pressed. Articles, rows and pages have none: they stay flat.
 * The only source of shadows and highlights in the app (Q19).
 */
export const DEPTH_LEVELS = ['soft', 'raised', 'pressed'] as const;
export type DepthLevel = (typeof DEPTH_LEVELS)[number];

type Layers = {
  /** The control's own colour; its label reads on it at 4.5:1 (Q14, D26). */
  face: string;
  /** How strong the light is at the top of the face, fading to none at the bottom (0–1). */
  light: number;
  /** The one-point highlight along the top edge (0–1). */
  sheen: number;
  /** A soft shadow below: offset `y` and `blur` in points, and how dark (0–1). */
  shadow: { y: number; blur: number; alpha: number };
};

/** What light and shadow are made of in each theme: cream light on Midnight, white light on cream. */
const LIGHT: Record<ThemeName, string> = { dark: palette.cream, light: palette.white };
const SHADOW: Record<ThemeName, string> = { dark: palette.black, light: palette.midnight };

export const depth: Record<ThemeName, Record<DepthLevel, Layers>> = {
  dark: {
    soft: { face: palette.dusk, light: 0.05, sheen: 0.08, shadow: { y: 1, blur: 2, alpha: 0.45 } },
    raised: { face: palette.navy, light: 0.08, sheen: 0.14, shadow: { y: 3, blur: 8, alpha: 0.5 } },
    pressed: { face: palette.dusk, light: 0, sheen: 0, shadow: { y: 0, blur: 0, alpha: 0 } },
  },
  light: {
    soft: { face: palette.paper, light: 0.5, sheen: 0.8, shadow: { y: 1, blur: 2, alpha: 0.16 } },
    raised: { face: palette.paperRaised, light: 0.6, sheen: 0.9, shadow: { y: 3, blur: 8, alpha: 0.2 } },
    pressed: { face: palette.sand, light: 0, sheen: 0, shadow: { y: 0, blur: 0, alpha: 0 } },
  },
};

/** `#RRGGBB` at `alpha`, as React Native's styles take it. */
function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The style that puts a control at `level` in `scheme`: its face, light, sheen and shadow together. */
export function depthStyle(scheme: ThemeName, level: DepthLevel): ViewStyle {
  const { face, light, sheen, shadow } = depth[scheme][level];
  const lightColour = LIGHT[scheme];
  return {
    backgroundColor: face,
    backgroundImage: `linear-gradient(to bottom, ${withAlpha(lightColour, light)}, ${withAlpha(lightColour, 0)})`,
    boxShadow: [
      { offsetX: 0, offsetY: shadow.y, blurRadius: shadow.blur, color: withAlpha(SHADOW[scheme], shadow.alpha) },
      { offsetX: 0, offsetY: 1, blurRadius: 0, color: withAlpha(lightColour, sheen), inset: true },
    ],
  };
}
