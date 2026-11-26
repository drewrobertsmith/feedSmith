import { backFrame, containerFrame, fadeThrough, isOnScreen, lerpRect } from '@/navigation/container-transform';
import { motion } from '@/theme/motion';

const screen = { width: 400, height: 800 };
const row = { x: 0, y: 300, width: 400, height: 120 };
const full = { x: 0, y: 0, ...screen };

// FEE-114: opening an Article grows its row into the page, Material's container transform.
describe('the container between the row and the page (FEE-114)', () => {
  test('starts exactly on the row and ends exactly on the page', () => {
    expect(lerpRect(row, full, 0)).toEqual(row);
    expect(lerpRect(row, full, 1)).toEqual(full);
  });

  test('halfway, every edge is halfway', () => {
    expect(lerpRect(row, full, 0.5)).toEqual({
      x: 0,
      y: 150,
      width: 400,
      height: 460,
    });
  });
});

// Material's fade through: what's leaving is gone before what's arriving shows, so two never share a place.
describe('the row fades out before the page fades in (FEE-114)', () => {
  const { fadeThrough: cut } = motion.articleOpen;

  test.each([
    ['at the start, only the row', 0, { outgoing: 1, incoming: 0 }],
    ['where they meet, neither', cut, { outgoing: 0, incoming: 0 }],
    ['at the end, only the page', 1, { outgoing: 0, incoming: 1 }],
  ])('%s', (_case, t, expected) => {
    const { outgoing, incoming } = fadeThrough(t);
    expect(outgoing).toBeCloseTo(expected.outgoing);
    expect(incoming).toBeCloseTo(expected.incoming);
  });

  test('never both at once', () => {
    for (let t = 0; t <= 1; t += 0.05) {
      const { outgoing, incoming } = fadeThrough(t);
      expect(outgoing === 0 || incoming === 0).toBe(true);
    }
  });
});

// Android's predictive back, as Material draws it for a page: it shrinks, rounds and leans toward the edge.
describe('the page follows the back gesture (FEE-114)', () => {
  const { scale, inset, radius } = motion.predictiveBack;

  test('untouched, it is the whole screen, square', () => {
    expect(backFrame(screen, 0, 'left')).toEqual({ rect: full, radius: 0 });
  });

  test('all the way, it is scaled about its centre, rounded, and leaning away from the edge it was pulled from', () => {
    const { rect, radius: r } = backFrame(screen, 1, 'left');
    expect(rect.width).toBeCloseTo(screen.width * scale);
    expect(rect.height).toBeCloseTo(screen.height * scale);
    expect(rect.y).toBeCloseTo((screen.height * (1 - scale)) / 2);
    expect(rect.x).toBeCloseTo((screen.width * (1 - scale)) / 2 + (screen.width / 20 - inset));
    expect(r).toBe(radius);
  });

  test('pulled from the right edge, it leans the other way', () => {
    const left = backFrame(screen, 1, 'left').rect.x;
    const right = backFrame(screen, 1, 'right').rect.x;
    expect(left - (screen.width * (1 - scale)) / 2).toBeCloseTo(-(right - (screen.width * (1 - scale)) / 2));
  });
});

// Back into the row only when the row is there to go back into.
describe('whether a row can be gone back into (FEE-114)', () => {
  test.each([
    ['on screen', row, true],
    ['partly above the top', { ...row, y: -60 }, true],
    ['scrolled off the top', { ...row, y: -200 }, false],
    ['scrolled off the bottom', { ...row, y: 900 }, false],
    ['not laid out', { ...row, width: 0, height: 0 }, false],
  ])('%s', (_case, rect, expected) => {
    expect(isOnScreen(rect, screen)).toBe(expected);
  });
});

// One frame for every part of the move, so the container, the page and the travelling picture agree.
describe('the page’s frame through the move and the gesture (FEE-114)', () => {
  const { scale: axisScale } = motion.articleAxis;

  test('from a row: on the row at the start, the whole screen at the end', () => {
    expect(containerFrame({ path: 'row', progress: 0, back: 0, edge: 'left', row, screen }).rect).toEqual(row);
    expect(containerFrame({ path: 'row', progress: 1, back: 0, edge: 'left', row, screen })).toEqual({ rect: full, radius: 0 });
  });

  test('open, the back gesture shrinks it as Material draws predictive back', () => {
    const { rect, radius } = containerFrame({ path: 'row', progress: 1, back: 0.5, edge: 'left', row, screen });
    const gesture = backFrame(screen, 0.5, 'left');
    (['x', 'y', 'width', 'height'] as const).forEach((side) => expect(rect[side]).toBeCloseTo(gesture.rect[side]));
    expect(radius).toBeCloseTo(gesture.radius);
  });

  test('let go mid-gesture, it shrinks from where the gesture left it into the row', () => {
    const left = backFrame(screen, 0.5, 'left').rect;
    const halfway = containerFrame({ path: 'row', progress: 0.5, back: 0.5, edge: 'left', row, screen }).rect;
    expect(halfway).toEqual(lerpRect(row, left, 0.5));
  });

  test('on the axis, with no row: from slightly smaller, about the centre', () => {
    const { rect } = containerFrame({ path: 'axis', progress: 0, back: 0, edge: 'left', row, screen });
    expect(rect.width).toBeCloseTo(screen.width * axisScale);
    expect(rect.x + rect.width / 2).toBeCloseTo(screen.width / 2);
    expect(rect.y + rect.height / 2).toBeCloseTo(screen.height / 2);
  });
});
