import { DEPTH_LEVELS, depth, depthStyle, rippleColor } from '@/theme/depth';
import { googleButton } from '@/theme/google';
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

// Q14: Google's own button (D10) keeps its label readable in both themes.
test.each(['dark', 'light'] as const)('the Google button label meets WCAG AA in %s', (scheme) => {
  const { label, background } = googleButton[scheme];
  expect(contrastRatio(label, background)).toBeGreaterThanOrEqual(4.5);
});

// Q14: a control's boundary reaches 3:1 against what's around it. The Add Feed field and
// AppButton draw theirs in textMuted, on the background and on a surface.
test.each(['dark', 'light'] as const)('control boundaries reach 3:1 in %s', (scheme) => {
  const theme = themes[scheme];
  expect(contrastRatio(theme.textMuted, theme.background)).toBeGreaterThanOrEqual(3);
  expect(contrastRatio(theme.textMuted, theme.surface)).toBeGreaterThanOrEqual(3);
});

// D19: one colour means "destroys data", in both themes, readable on every surface it can sit on.
test.each(['dark', 'light'] as const)('the destructive colour reads at 4.5:1 on every %s surface (D19)', (scheme) => {
  const theme = themes[scheme];
  expect(theme.destructive).toBeDefined();
  expect(theme.destructive).not.toBe(theme.accent);
  for (const surface of SURFACE_ROLES) {
    expect(contrastRatio(theme.destructive, theme[surface])).toBeGreaterThanOrEqual(4.5);
  }
});

// FEE-30: swiping to Save reveals a Gold panel whose label and icon are the page's background
// colour; the Saved mark and the Reading view's filled bookmark are Gold on the background.
test.each(['dark', 'light'] as const)('Save on Gold reads at 4.5:1, and the Gold mark reaches 3:1, in %s (Q14)', (scheme) => {
  const theme = themes[scheme];
  // The label on the Gold panel; at 4.5:1 the Gold mark on the background clears its 3:1 too.
  expect(contrastRatio(theme.background, theme.accent)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(theme.accent, theme.surface)).toBeGreaterThanOrEqual(3);
});

// Q14 (D26): a control is found by its label, which reads at 4.5:1 on its own face at every depth level
// (FEE-74). Icons use the muted text colour, so they clear 3:1 too. Gold, the chosen label, on every face.
describe.each(['dark', 'light'] as const)('depth in %s', (scheme) => {
  const theme = themes[scheme];
  test.each(DEPTH_LEVELS)('every label colour reads at 4.5:1 on the %s face', (level) => {
    const face = depth[scheme][level].face;
    for (const role of ['text', 'textMuted', 'accent'] as const) {
      expect(contrastRatio(theme[role], face)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('the chosen chip stands one level above the others: a deeper, longer shadow', () => {
    const { soft, raised } = depth[scheme];
    expect(raised.shadow.blur).toBeGreaterThan(soft.shadow.blur);
    expect(raised.shadow.y).toBeGreaterThan(soft.shadow.y);
  });

  // A face is a step off the page, so a control reads as an object even before its shadow does (D27).
  // It needn't reach 3:1 against it: the label identifies the control (D26).
  test.each(DEPTH_LEVELS)('the %s face is never the page colour', (level) => {
    expect(contrastRatio(depth[scheme][level].face, theme.background)).toBeGreaterThan(1.03);
  });

  test('pressed sinks: no shadow', () => {
    expect(depth[scheme].pressed.shadow.alpha).toBe(0);
  });

  // D29: Android's terms. Material lights no surface from above, so there's no gradient or top-edge
  // sheen, only a tonal face and a soft shadow; and a press shows Android's ripple.
  test.each(DEPTH_LEVELS)('the %s level is a face and a shadow only, in Material\'s terms', (level) => {
    const style = depthStyle(scheme, level);
    expect(style).not.toHaveProperty('backgroundImage');
    expect(style.boxShadow).toHaveLength(1);
    expect(style.boxShadow).not.toEqual([expect.objectContaining({ inset: true })]);
  });

  test('the ripple is the text colour at Material\'s pressed-state strength', () => {
    // Cream on Midnight, Midnight on cream, each at 10%.
    expect(rippleColor(scheme)).toBe({ dark: 'rgba(243, 236, 221, 0.1)', light: 'rgba(29, 37, 50, 0.1)' }[scheme]);
  });
});
