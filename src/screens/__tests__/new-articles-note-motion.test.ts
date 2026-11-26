import { NOTE_ENTERING, NOTE_EXITING } from '@/screens/new-articles-note-motion';

type Frame = { opacity?: number; transform?: Record<string, number>[] };
/** What a Keyframe keeps inside, which its public type doesn't show: its frames and its length. */
const inside = (keyframe: unknown) => keyframe as { definitions: Record<string, Frame>; durationV?: number };
const frames = (keyframe: unknown) => inside(keyframe).definitions;
const scaleOf = (frame: Frame) => frame.transform?.find((step) => 'scale' in step)?.scale;
const moves = (frame: Frame) => frame.transform?.some((step) => 'translateX' in step || 'translateY' in step) ?? false;

// FEE-118: the New Articles pill comes and goes like a Material floating button: from its own centre, never moving.
describe('the New Articles pill appears and leaves like a Material floating button (FEE-118)', () => {
  test('it grows in from slightly smaller while fading in', () => {
    const { 0: start, 100: end } = frames(NOTE_ENTERING);
    expect(start.opacity).toBe(0);
    expect(scaleOf(start)).toBeLessThan(1);
    expect(end.opacity).toBe(1);
    expect(scaleOf(end)).toBe(1);
  });

  test('it shrinks a little while fading out', () => {
    const { 0: start, 100: end } = frames(NOTE_EXITING);
    expect(start.opacity).toBe(1);
    expect(end.opacity).toBe(0);
    expect(scaleOf(end)).toBeLessThan(1);
  });

  test('it never travels: it stays at its own place, so it’s never off-screen', () => {
    for (const keyframe of [NOTE_ENTERING, NOTE_EXITING]) {
      for (const frame of Object.values(frames(keyframe))) expect(moves(frame)).toBe(false);
    }
  });

  test('it leaves quicker than it came', () => {
    expect(inside(NOTE_EXITING).durationV).toBeLessThan(inside(NOTE_ENTERING).durationV!);
  });
});
