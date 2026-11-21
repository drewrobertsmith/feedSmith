import { tabBarColors } from '@/navigation/tab-bar-colors';
import { contrastRatio } from '@/theme/tokens';

const DARK_GOLD = '#CBB07B';
const LIGHT_GOLD = '#6F5626';

describe.each([
  ['dark', DARK_GOLD],
  ['light', LIGHT_GOLD],
] as const)('%s tab bar', (scheme, gold) => {
  const colors = tabBarColors(scheme);

  test('gold marks the active item, icon and label', () => {
    expect(colors.iconColor.selected).toBe(gold);
    expect(colors.labelStyle.selected.color).toBe(gold);
  });

  test('gold appears nowhere else', () => {
    const { iconColor, labelStyle, ...rest } = colors;
    expect(iconColor.default).not.toBe(gold);
    expect(labelStyle.default.color).not.toBe(gold);
    expect(Object.values(rest)).not.toContain(gold);
  });

  test('the active item stays readable on its indicator (WCAG AA)', () => {
    expect(contrastRatio(colors.labelStyle.selected.color, colors.indicatorColor)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors.labelStyle.default.color, colors.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  });

  test('labels use the interface typeface, not Roboto', () => {
    expect(colors.labelStyle.default.fontFamily).toBe('InstrumentSans');
    expect(colors.labelStyle.selected.fontFamily).toBe('InstrumentSans');
  });
});
