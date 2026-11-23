import { PNG } from 'pngjs';

import { compare, cropTop, halve } from '../scripts/visual-check/compare';

/** A `width`×`height` PNG of one colour, with `paint` changing pixels by position. */
function png(width: number, height: number, colour: number[], paint?: (x: number, y: number) => number[] | undefined) {
  const image = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = paint?.(x, y) ?? colour;
      image.data.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return PNG.sync.write(image);
}

const MIDNIGHT = [29, 37, 50];

test('the same picture differs nowhere', () => {
  expect(compare(png(10, 10, MIDNIGHT), png(10, 10, MIDNIGHT)).changed).toBe(0);
});

test('one changed pixel in a hundred is 1% changed, and the difference marks it', () => {
  const result = compare(png(10, 10, MIDNIGHT), png(10, 10, MIDNIGHT, (x, y) => (x === 3 && y === 4 ? [243, 236, 221] : undefined)));
  expect(result.changed).toBeCloseTo(0.01);
  const diff = PNG.sync.read(result.diff);
  const at = (x: number, y: number) => Array.from(diff.data.subarray((y * 10 + x) * 4, (y * 10 + x) * 4 + 3));
  expect(at(3, 4)).toEqual([255, 0, 0]);
  expect(at(0, 0)).not.toEqual([255, 0, 0]);
});

test('a shift too small to see is not a change', () => {
  expect(compare(png(10, 10, MIDNIGHT), png(10, 10, [30, 38, 51])).changed).toBe(0);
});

test('a faint change, like a soft shadow, is still a change', () => {
  expect(compare(png(10, 10, MIDNIGHT), png(10, 10, [39, 47, 64])).changed).toBe(1);
});

test('pictures of different sizes differ everywhere', () => {
  expect(compare(png(10, 10, MIDNIGHT), png(10, 12, MIDNIGHT))).toMatchObject({ changed: 1, sameSize: false });
});

test('halving averages each two-by-two block', () => {
  const half = PNG.sync.read(halve(png(4, 2, MIDNIGHT, (x) => (x % 2 === 0 ? [0, 0, 0] : [200, 100, 50]))));
  expect([half.width, half.height]).toEqual([2, 1]);
  expect(Array.from(half.data.subarray(0, 4))).toEqual([100, 50, 25, 255]);
});

test('cropping the top drops the status bar and keeps the rest as it was', () => {
  const cropped = PNG.sync.read(cropTop(png(3, 5, MIDNIGHT, (_x, y) => (y < 2 ? [255, 255, 255] : undefined)), 2));
  expect([cropped.width, cropped.height]).toEqual([3, 3]);
  expect(Array.from(cropped.data.subarray(0, 3))).toEqual(MIDNIGHT);
});
