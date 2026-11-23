import { chipDirection } from '@/screens/chip-direction';

describe('which way the list slides when the chosen chip changes (FEE-42)', () => {
  test.each([
    ['a chip to the right', 0, 2, 1],
    ['a chip to the left', 3, 1, -1],
    ['the same chip', 2, 2, 0],
    ['the first showing of the list', null, 0, 0],
    ['a chip that is gone (a removed Feed)', 2, -1, 0],
  ])('%s', (_case, from, to, direction) => {
    expect(chipDirection(from, to)).toBe(direction);
  });
});
