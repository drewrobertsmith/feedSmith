import { chipLabel, edgeFades } from '@/screens/chip-row-layout';

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
  test.each([
    ['every chip fits: no fade', 0, 400, 380, { start: false, end: false }],
    ['at the start of a longer row: fade at the end', 0, 400, 900, { start: false, end: true }],
    ['scrolled part way: fade at both ends', 200, 400, 900, { start: true, end: true }],
    ['scrolled to the end: fade at the start', 500, 400, 900, { start: true, end: false }],
    ['before the row has measured itself: no fade', 0, 0, 0, { start: false, end: false }],
  ])('%s', (_case, x, width, content, fades) => {
    expect(edgeFades(x, width, content)).toEqual(fades);
  });
});
