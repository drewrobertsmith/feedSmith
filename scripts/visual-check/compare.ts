import { PNG } from 'pngjs';

/**
 * How far one colour channel may move before a pixel counts as changed. Small enough that a soft
 * shadow or a one-step colour change shows; large enough to ignore rounding in the emulator's renderer.
 */
const CHANNEL_TOLERANCE = 3;

export type Comparison = {
  /** The share of pixels that changed, from 0 to 1; 1 when the sizes differ. */
  changed: number;
  sameSize: boolean;
  /** The new picture, faded to grey, with every changed pixel in red. */
  diff: Buffer;
};

/** Compares two PNGs pixel by pixel (FEE-70). */
export function compare(approvedPng: Buffer, actualPng: Buffer): Comparison {
  const approved = PNG.sync.read(approvedPng);
  const actual = PNG.sync.read(actualPng);
  if (approved.width !== actual.width || approved.height !== actual.height) {
    return { changed: 1, sameSize: false, diff: actualPng };
  }

  const diff = new PNG({ width: actual.width, height: actual.height });
  let changed = 0;
  for (let i = 0; i < actual.data.length; i += 4) {
    const moved =
      Math.abs(approved.data[i] - actual.data[i]) > CHANNEL_TOLERANCE ||
      Math.abs(approved.data[i + 1] - actual.data[i + 1]) > CHANNEL_TOLERANCE ||
      Math.abs(approved.data[i + 2] - actual.data[i + 2]) > CHANNEL_TOLERANCE;
    if (moved) {
      changed++;
      diff.data.set([255, 0, 0, 255], i);
    } else {
      const grey = Math.round(160 + (actual.data[i] + actual.data[i + 1] + actual.data[i + 2]) / 12);
      diff.data.set([grey, grey, grey, 255], i);
    }
  }
  return { changed: changed / (actual.width * actual.height), sameSize: true, diff: PNG.sync.write(diff) };
}

/** Halves a PNG's width and height by averaging each two-by-two block, so approved pictures stay small. */
export function halve(png: Buffer): Buffer {
  const source = PNG.sync.read(png);
  const width = Math.floor(source.width / 2);
  const height = Math.floor(source.height / 2);
  const half = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let channel = 0; channel < 4; channel++) {
        const at = (dx: number, dy: number) => source.data[((2 * y + dy) * source.width + 2 * x + dx) * 4 + channel];
        half.data[(y * width + x) * 4 + channel] = Math.round((at(0, 0) + at(1, 0) + at(0, 1) + at(1, 1)) / 4);
      }
    }
  }
  // Screenshots are opaque, so RGB at the strongest compression: about 8% smaller than pngjs's default.
  return PNG.sync.write(half, { colorType: 2, deflateLevel: 9 });
}

/** Drops a PNG's top `rows`: the status bar, whose icons come from the system, not the app. */
export function cropTop(png: Buffer, rows: number): Buffer {
  const source = PNG.sync.read(png);
  const cropped = new PNG({ width: source.width, height: source.height - rows });
  source.data.copy(cropped.data, 0, rows * source.width * 4);
  return PNG.sync.write(cropped);
}
