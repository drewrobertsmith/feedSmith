import { themes, type ThemeName } from '@/theme/tokens';
import { typeScale } from '@/theme/type';

/**
 * The bottom bar's colour props for NativeTabs. Every colour is set from the brand tokens,
 * so Android's wallpaper (Material You) colours never show (D4). Gold marks only the
 * active item (D5).
 */
export function tabBarColors(scheme: ThemeName) {
  const theme = themes[scheme];
  const { fontFamily } = typeScale.label;

  return {
    backgroundColor: theme.background,
    indicatorColor: theme.indicator,
    rippleColor: theme.surface,
    iconColor: { default: theme.textMuted, selected: theme.accent },
    labelStyle: {
      default: { fontFamily, color: theme.textMuted },
      selected: { fontFamily, color: theme.accent },
    },
  };
}
