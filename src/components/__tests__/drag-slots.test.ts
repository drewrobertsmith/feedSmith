import { shiftFor, slotFor } from '@/components/drag-slots';

// Three rows; the middle one is taller (say, a "Not working" line). 8 between rows.
const HEIGHTS = [100, 140, 100];
const GAP = 8;

describe('slotFor: where a held row would land', () => {
  test.each([
    ['barely moved', 0, 30, 0, 0],
    ['dragged down past half the next row', 0, 80, 1, 148],
    ['dragged down past both', 0, 260, 2, 256],
    ['dragged past the end stays at the end', 0, 999, 2, 256],
    ['dragged up past half the row above', 2, -80, 1, -148],
    ['dragged up past the top stays at the top', 2, -999, 0, -256],
  ])('%s', (_case, from, by, to, settle) => {
    expect(slotFor(from, by, HEIGHTS, GAP, HEIGHTS.length)).toEqual({ to, settle });
  });

  test("rows not measured yet don't move anything", () => {
    expect(slotFor(0, 200, [], GAP, 3)).toEqual({ to: 0, settle: 0 });
  });
});

describe('shiftFor: how far the other rows make room', () => {
  test('rows the held one passes going down move up by its height', () => {
    // Row 0 held and dragged to the end: rows 1 and 2 move up by 100 + 8.
    expect([1, 2].map((row) => shiftFor(row, 0, 999, HEIGHTS, GAP, 3))).toEqual([-108, -108]);
  });

  test('rows the held one passes going up move down by its height', () => {
    expect([0, 1].map((row) => shiftFor(row, 2, -999, HEIGHTS, GAP, 3))).toEqual([108, 108]);
  });

  test("rows it hasn't reached, the held row itself, and nothing held: no shift", () => {
    expect(shiftFor(2, 0, 80, HEIGHTS, GAP, 3)).toBe(0);
    expect(shiftFor(0, 0, 80, HEIGHTS, GAP, 3)).toBe(0);
    expect(shiftFor(1, -1, 0, HEIGHTS, GAP, 3)).toBe(0);
  });
});
