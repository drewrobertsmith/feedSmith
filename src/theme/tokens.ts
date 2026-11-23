/**
 * feedSmith's colour tokens (D2–D5). The single source for every colour in the app:
 * `src/global.css` mirrors the themes' roles as Uniwind themes, and a test keeps the two in step.
 * Palette colours used only through the theme's own modules (the depth faces, D27) aren't mirrored.
 */
export const palette = {
  midnight: '#1D2532',
  /** Between Midnight and Navy: the face of a soft control on Midnight (FEE-74). */
  dusk: '#272F40',
  navy: '#333D5F',
  forest: '#2D423E',
  sage: '#50716C',
  gold: '#CBB07B',
  /** Gold fails contrast on cream (1.8:1), so light mode uses this deeper gold. */
  goldDeep: '#6F5626',
  cream: '#F3ECDD',
  creamMuted: '#B9B2A4',
  sand: '#E8DECA',
  /** A step lighter than cream: the face of a soft control on cream (FEE-74). */
  paper: '#F9F5EC',
  /** Lighter still: the face of a raised control on cream. */
  paperRaised: '#FDFBF6',
  /** Light that falls on a face; in dark mode the light is cream. */
  white: '#FFFFFF',
  /** What a shadow is made of on Midnight. */
  black: '#000000',
  slate: '#4A5468',
  /** Destroys data (D19): readable on Navy and Midnight. */
  brickLight: '#E8A08A',
  /** Destroys data (D19), in light mode: readable on cream and sand. */
  brickDeep: '#8E2F23',
} as const;

/**
 * What each colour means (Q30). `accent` is Gold: active or yours (D5). `destructive` is brick:
 * an action that destroys data, such as deleting an Account (D19). The rest are neutrals.
 */
export const TEXT_ROLES = ['text', 'textMuted', 'accent', 'destructive'] as const;
export const SURFACE_ROLES = ['background', 'surface', 'indicator'] as const;

type TextRole = (typeof TEXT_ROLES)[number];
type SurfaceRole = (typeof SURFACE_ROLES)[number];
/** Never used for text: hairlines and decoration only. */
type DecorRole = 'decor';

export type Theme = Record<TextRole | SurfaceRole | DecorRole, string>;
export type ThemeName = 'dark' | 'light';

export const themes: Record<ThemeName, Theme> = {
  dark: {
    background: palette.midnight,
    surface: palette.navy,
    indicator: palette.navy,
    text: palette.cream,
    textMuted: palette.creamMuted,
    accent: palette.gold,
    destructive: palette.brickLight,
    decor: palette.sage,
  },
  light: {
    background: palette.cream,
    surface: palette.sand,
    indicator: palette.sand,
    text: palette.midnight,
    textMuted: palette.slate,
    accent: palette.goldDeep,
    destructive: palette.brickDeep,
    decor: palette.sage,
  },
};

function relativeLuminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two `#RRGGBB` colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
