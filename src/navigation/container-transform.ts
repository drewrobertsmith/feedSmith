import { motion } from '@/theme/motion';

/** A box in window coordinates. */
export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };
export type Edge = 'left' | 'right';

const clamp01 = (value: number) => {
  'worklet';
  return Math.min(1, Math.max(0, value));
};

/** The container `t` of the way from `from` to `to` (FEE-114), every edge moving together. */
export function lerpRect(from: Rect, to: Rect, t: number): Rect {
  'worklet';
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    width: from.width + (to.width - from.width) * t,
    height: from.height + (to.height - from.height) * t,
  };
}

/**
 * Material's fade through, `t` of the way into a move: what's leaving fades out by `fadeThrough`, and only
 * then does what's arriving fade in, so the two never share a place.
 */
export function fadeThrough(t: number): { outgoing: number; incoming: number } {
  'worklet';
  const cut = motion.articleOpen.fadeThrough;
  return {
    outgoing: 1 - clamp01(t / cut),
    incoming: clamp01((t - cut) / (1 - cut)),
  };
}

/**
 * Where the page is while Android's back gesture is `progress` of the way (FEE-114), as Material draws
 * predictive back for a page: scaled about its centre, rounded, and leaning away from the edge it was
 * pulled from.
 */
export function backFrame(screen: Size, progress: number, edge: Edge): { rect: Rect; radius: number } {
  'worklet';
  const { scale, inset, radius } = motion.predictiveBack;
  const p = clamp01(progress);
  const s = 1 - (1 - scale) * p;
  const lean = (screen.width / 20 - inset) * p * (edge === 'left' ? 1 : -1);
  return {
    rect: {
      x: (screen.width * (1 - s)) / 2 + lean,
      y: (screen.height * (1 - s)) / 2,
      width: screen.width * s,
      height: screen.height * s,
    },
    radius: radius * p,
  };
}

/** Whether enough of a box is on screen to go back into: at least half of it. */
export function isOnScreen(rect: Rect, screen: Size): boolean {
  'worklet';
  if (rect.width <= 0 || rect.height <= 0) return false;
  const visible = Math.min(rect.y + rect.height, screen.height) - Math.max(rect.y, 0);
  return visible >= rect.height / 2;
}

/**
 * The page's frame (FEE-114): `progress` of the way from where it starts (the row, or on the axis slightly
 * smaller about the centre) to the screen as the back gesture, `back` of the way, has left it. Every part of
 * the move reads this one frame, so the container, the page and the travelling picture never disagree.
 */
export function containerFrame(input: {
  path: 'row' | 'axis';
  progress: number;
  back: number;
  edge: Edge;
  row: Rect;
  screen: Size;
}): { rect: Rect; radius: number } {
  'worklet';
  const { path, progress, back, edge, row, screen } = input;
  const gesture = backFrame(screen, back, edge);
  if (path === 'row') return { rect: lerpRect(row, gesture.rect, progress), radius: gesture.radius * progress };
  const a = motion.articleAxis.scale + (1 - motion.articleAxis.scale) * progress;
  const { x, y, width, height } = gesture.rect;
  return {
    rect: { x: x + (width * (1 - a)) / 2, y: y + (height * (1 - a)) / 2, width: width * a, height: height * a },
    radius: gesture.radius,
  };
}
