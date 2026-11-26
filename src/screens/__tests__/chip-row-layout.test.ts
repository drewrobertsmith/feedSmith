import { chipLabel, chipSettle, fadeRanges, revealOffset, transparent } from '@/screens/chip-row-layout';
import { motion } from '@/theme/motion';

// FEE-117: a chip changes state the Material way: eased over a short, standard curve, or at once (Q17).
describe('how a chip changes state (FEE-117)', () => {
  test('with motion on, its face and label ease over the chip duration', () => {
    expect(chipSettle(false)).toEqual({ duration: motion.chipSelect.duration, easing: motion.chipSelect.easing });
  });
  test('with Remove animations on, at once (Q17)', () => {
    expect(chipSettle(true).duration).toBe(0);
  });
});

describe("a chip's label is short (FEE-44)", () => {
  test.each([
    ['a short name, as it is', 'Calm Notes', 'Calm Notes'],
    ['exactly 16 characters, as it is', 'Sixteen chars ok', 'Sixteen chars ok'],
    ['a long name, cut at a word with an ellipsis', 'The Verge - Full RSS for subscribers | The Verge', 'The Verge - Full…'],
    ['one very long word, cut mid-word', 'Supercalifragilisticexpialidocious', 'Supercalifragili…'],
  ])('%s', (_case, title, label) => {
    expect(chipLabel(title)).toBe(label);
  });
});

describe('where the chip row fades (FEE-44)', () => {
  // A fade's opacity follows the scroll: the start fades in over the first FADE of scroll, the end fades out over the last.
  test.each([
    ['every chip fits: no fades', 400, 380, null],
    ['before the row has measured itself: no fades', 0, 0, null],
    ['a longer row: the start over the first 32, the end over the last 32', 400, 900, { start: [0, 32], end: [468, 500] }],
  ])('%s', (_case, width, content, ranges) => {
    expect(fadeRanges(width, content, 32)).toEqual(ranges);
  });
});

describe('bringing the chosen chip into view (FEE-44)', () => {
  const view = { scrollX: 0, width: 400, fade: 32, edge: 16 };
  test.each([
    ['a chip in full view stays put', { x: 100, width: 80 }, view, null],
    ['the first chip, at rest at the start', { x: 16, width: 60 }, view, null],
    ['a chip past the end scrolls to sit an edge from the start', { x: 1100, width: 90 }, view, 1084],
    ['a chip clipped by the end fade scrolls in', { x: 300, width: 90 }, view, 284],
    ['a chip under the start fade, once scrolled, scrolls back', { x: 220, width: 90 }, { ...view, scrollX: 200 }, 204],
    ['a chip behind the scroll scrolls back, never below 0', { x: 10, width: 60 }, { ...view, scrollX: 300 }, 0],
  ])('%s', (_case, chip, at, to) => {
    expect(revealOffset(chip, at)).toBe(to);
  });
});

describe("the fade's transparent end (FEE-44)", () => {
  test('a #RRGGBB colour gets a zero alpha', () => expect(transparent('#1D2532')).toBe('#1D253200'));
  test('any other format is refused, so a token change cannot silently break the fade', () =>
    expect(() => transparent('rgb(0,0,0)')).toThrow());
});
