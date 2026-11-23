/**
 * The physics of swiping a row left to Save or mark Done (FEE-30), as worklets: they run on the UI
 * thread while the finger moves, and are plain functions in tests.
 */

/** About a third of the way across: past it, letting go commits. */
const COMMIT_FRACTION = 0.35;
/** A swipe must travel this far before speed alone can commit it, so a twitch never does. */
const MIN_FLICK = 24;
/** How far each pixel the other way moves the row: a little give, then it stops. */
const WRONG_WAY_GIVE = 0.55;
const WRONG_WAY_LIMIT = 32;

/** Where a flick would come to rest if it kept decelerating (iOS's exponential decay). */
function projected(velocity: number, decelerationRate = 0.998): number {
  'worklet';
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/**
 * The row's offset for a drag: it follows the finger left, never past its own width; to the right
 * there's nothing, so it resists, rubber-band style, and stops short.
 */
export function dragOffset(translationX: number, width: number): number {
  'worklet';
  if (translationX <= 0) return Math.max(translationX, -width);
  const give = translationX * WRONG_WAY_GIVE;
  return (give * WRONG_WAY_LIMIT) / (WRONG_WAY_LIMIT + give);
}

/** Whether letting go here would commit: the moment the panel's icon grows and a tick is felt. */
export function pastCommitPoint(offset: number, width: number): boolean {
  'worklet';
  return -offset > width * COMMIT_FRACTION;
}

/**
 * Whether letting go commits the swipe: where the row would come to rest, with the flick's speed
 * carrying it on, is past the commit point. A drag pulled back toward the start snaps back.
 */
export function commits(offset: number, velocityX: number, width: number): boolean {
  'worklet';
  if (-offset < MIN_FLICK) return false;
  return pastCommitPoint(offset + projected(velocityX), width);
}
