import { act, renderHook } from '@testing-library/react-native';

import { updatedLine, usePull } from '@/feeds/use-pull';

const OLD = 1_000;
const PULLED = 5_000;

/** A pull whose answer the test releases by hand. */
function heldPull() {
  let release: (until: number | null) => void = () => {};
  const run = jest.fn(() => new Promise<number | null>((resolve) => (release = resolve)));
  return { run, release: (until: number | null) => release(until) };
}

describe('"Updating…" lasts until the pull\'s results are on screen (FEE-103)', () => {
  const render = (run: () => Promise<number | null>, at: number | null) =>
    renderHook(({ at: now }: { at: number | null }) => usePull(run, now), { initialProps: { at } });

  test('while the pull runs, it is updating', async () => {
    const pull = heldPull();
    const { result } = await render(pull.run, OLD);
    expect(result.current.refreshing).toBe(false);
    await act(async () => void result.current.refresh());
    expect(result.current.refreshing).toBe(true);
  });

  test("the pull answers before its results arrive: still updating, until the line's time catches up", async () => {
    const pull = heldPull();
    const { result, rerender } = await render(pull.run, OLD);
    await act(async () => void result.current.refresh());
    await act(async () => pull.release(PULLED));
    expect(result.current.refreshing).toBe(true);
    await rerender({ at: PULLED });
    expect(result.current.refreshing).toBe(false);
  });

  test('the results arrive before the pull answers: done as soon as it answers', async () => {
    const pull = heldPull();
    const { result, rerender } = await render(pull.run, OLD);
    await act(async () => void result.current.refresh());
    await rerender({ at: PULLED });
    expect(result.current.refreshing).toBe(true);
    await act(async () => pull.release(PULLED));
    expect(result.current.refreshing).toBe(false);
  });

  test('a pull that fetched nothing is done when it answers', async () => {
    const pull = heldPull();
    const { result } = await render(pull.run, OLD);
    await act(async () => void result.current.refresh());
    await act(async () => pull.release(null));
    expect(result.current.refreshing).toBe(false);
  });

  test("the line's time moving any other way (a Feed removed mid-pull) also ends it, so it never sticks", async () => {
    const pull = heldPull();
    const { result, rerender } = await render(pull.run, OLD);
    await act(async () => void result.current.refresh());
    await act(async () => pull.release(PULLED));
    await rerender({ at: OLD - 1 });
    expect(result.current.refreshing).toBe(false);
  });

  test('a second pull after the first works the same way', async () => {
    const pull = heldPull();
    const { result, rerender } = await render(pull.run, OLD);
    await act(async () => void result.current.refresh());
    await act(async () => pull.release(PULLED));
    await rerender({ at: PULLED });
    await act(async () => void result.current.refresh());
    expect(result.current.refreshing).toBe(true);
    await act(async () => pull.release(PULLED + 1));
    await rerender({ at: PULLED + 1 });
    expect(result.current.refreshing).toBe(false);
  });
});

describe('the "Updated" line, as a still part and the time (FEE-104, D20)', () => {
  const NOW = 10 * 60_000;
  test.each([
    ['updating', true, NOW - 5 * 60_000, { still: 'Updating…', time: '' }],
    ['updated a while ago', false, NOW - 5 * 60_000, { still: 'Updated', time: ' 5 min ago' }],
    ['updated just now', false, NOW, { still: 'Updated', time: ' just now' }],
  ] as const)('%s', (_case, refreshing, at, parts) => {
    expect(updatedLine(refreshing, at, NOW)).toEqual(parts);
  });

  test('nothing to say before the first fetch, unless a pull is under way', () => {
    expect(updatedLine(false, null, NOW)).toBeUndefined();
    expect(updatedLine(true, null, NOW)).toEqual({ still: 'Updating…', time: '' });
  });

  test('its parts read as one line', () => {
    const parts = updatedLine(false, NOW - 2 * 60_000, NOW)!;
    expect(parts.still + parts.time).toBe('Updated 2 min ago');
  });
});

describe('the line offline (FEE-32)', () => {
  test('says Offline with the time it was last updated, in place of a pull', () => {
    expect(updatedLine(true, 0, 5 * 60_000, true)).toEqual({ still: 'Offline · updated', time: ' 5 min ago' });
  });

  test('says only Offline when nothing was ever fetched', () => {
    expect(updatedLine(false, null, 0, true)).toEqual({ still: 'Offline', time: '' });
  });
});
