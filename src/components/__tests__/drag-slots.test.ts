import { moved, slotFor, slotTop, totalHeight } from '@/components/drag-slots';

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

describe('the order a drag makes, and where each row sits in it', () => {
  const ORDER = ['a', 'b', 'c'];
  const BY_ID = { a: 100, b: 140, c: 100 };

  test('moving a row takes it out and puts it back at its new place', () => {
    expect(moved(ORDER, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moved(ORDER, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moved(ORDER, 1, 1)).toEqual(ORDER);
  });

  test("a row's top is the rows above it, each with the gap after it", () => {
    expect(ORDER.map((id) => slotTop(ORDER, BY_ID, GAP, id))).toEqual([0, 108, 256]);
    expect(slotTop(['c', 'a', 'b'], BY_ID, GAP, 'b')).toBe(216);
  });

  test('the list is as tall as its rows and the gaps between them', () => {
    expect(totalHeight(ORDER, BY_ID, GAP)).toBe(356);
    expect(totalHeight([], BY_ID, GAP)).toBe(0);
  });

  test("a row not measured yet takes no room", () => {
    expect(slotTop(ORDER, { a: 100 }, GAP, 'c')).toBe(116);
  });
});
