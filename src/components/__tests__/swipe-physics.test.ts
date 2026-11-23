import { commits, dragOffset, pastCommitPoint } from '@/components/swipe-physics';

const WIDTH = 400;

describe('where a row swiped left can be let go (FEE-30)', () => {
  test('it follows the finger to the left', () => {
    expect(dragOffset(-120, WIDTH)).toBe(-120);
  });

  test('to the right it barely moves: there is nothing that way', () => {
    const right = dragOffset(200, WIDTH);
    expect(right).toBeGreaterThan(0);
    expect(right).toBeLessThan(40);
  });

  test('it never goes past the row', () => {
    expect(dragOffset(-900, WIDTH)).toBeGreaterThanOrEqual(-WIDTH);
  });

  test('the commit point is about a third of the way across', () => {
    expect(pastCommitPoint(-0.3 * WIDTH, WIDTH)).toBe(false);
    expect(pastCommitPoint(-0.4 * WIDTH, WIDTH)).toBe(true);
  });
});

describe('letting go (FEE-30)', () => {
  test('a slow drag past the commit point commits', () => {
    expect(commits(-0.45 * WIDTH, 0, WIDTH)).toBe(true);
  });

  test('let go early, it snaps back: trying it costs nothing', () => {
    expect(commits(-0.2 * WIDTH, 0, WIDTH)).toBe(false);
  });

  test('a quick flick left commits, even when short', () => {
    expect(commits(-0.15 * WIDTH, -1500, WIDTH)).toBe(true);
  });

  test('pulled back toward the start, it snaps back even from past the point', () => {
    expect(commits(-0.45 * WIDTH, 1500, WIDTH)).toBe(false);
  });

  test('a tiny twitch with speed is not a swipe', () => {
    expect(commits(-8, -1500, WIDTH)).toBe(false);
  });
});
