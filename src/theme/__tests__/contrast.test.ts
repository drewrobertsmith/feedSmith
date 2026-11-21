import { contrastRatio, palette, TEXT_ROLES, SURFACE_ROLES, themes } from '@/theme/tokens';

describe('contrastRatio', () => {
  test('matches known WCAG ratios', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    // Worked out in FEE-18's notes.
    expect(contrastRatio('#CBB07B', '#1D2532')).toBeCloseTo(7.36, 1);
    expect(contrastRatio('#CBB07B', '#F3ECDD')).toBeCloseTo(1.78, 1);
    expect(contrastRatio('#50716C', '#1D2532')).toBeCloseTo(2.88, 1);
  });
});

describe.each(['dark', 'light'] as const)('%s theme', (name) => {
  const theme = themes[name];

  const pairs = TEXT_ROLES.flatMap((text) => SURFACE_ROLES.map((surface) => [text, surface] as const));

  test.each(pairs)('%s on %s meets WCAG AA (4.5:1)', (text, surface) => {
    expect(contrastRatio(theme[text], theme[surface])).toBeGreaterThanOrEqual(4.5);
  });
});

test('dark theme is built on Midnight with cream text', () => {
  expect(themes.dark.background).toBe('#1D2532');
  expect(themes.dark.text).toBe(palette.cream);
});

test('Gold is the dark accent, and light mode uses a darker gold', () => {
  expect(themes.dark.accent).toBe('#CBB07B');
  expect(themes.light.accent).not.toBe('#CBB07B');
});

test('Sage is never a text colour on Midnight', () => {
  for (const role of TEXT_ROLES) {
    expect(themes.dark[role]).not.toBe('#50716C');
  }
});
