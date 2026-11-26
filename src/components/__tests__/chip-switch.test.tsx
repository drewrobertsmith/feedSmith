import { act, renderHook } from '@testing-library/react-native';

import { FIXTURE_ROWS } from '@/worlds/fixtures';
import type { ShownRows } from '@/components/chip-switch';
import { motion } from '@/theme/motion';

// The Feeds tests replace the chip switch (test/jest-setup.js); here it's the real one.
const { useChipSwitch } = jest.requireActual<typeof import('@/components/chip-switch')>('@/components/chip-switch');

const all = { articles: FIXTURE_ROWS, index: 0 };
const verge = { articles: FIXTURE_ROWS.filter((row) => row.feedId === 'f1'), index: 1 };
const { out } = motion.chipSwitch;

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

type Props = { shown: ShownRows };
const render = (reduceMotion = false) =>
  renderHook(({ shown }: Props) => useChipSwitch(shown, reduceMotion), { initialProps: { shown: all } });

// FEE-116: switching chips moves the list on Material's shared axis X: the old rows leave first, then the new arrive.
describe('which rows the list shows while switching chips (FEE-116)', () => {
  test('the old chip’s rows stay while they leave, and the new ones show once they’ve gone', async () => {
    const { result, rerender } = await render();
    await rerender({ shown: verge });
    expect(result.current.shown).toBe(all);
    await act(async () => jest.advanceTimersByTime(out + 50));
    expect(result.current.shown.index).toBe(verge.index);
    expect(result.current.shown.articles).toBe(verge.articles);
  });

  test('new rows for the same chip show at once: nothing leaves', async () => {
    const { result, rerender } = await render();
    const refreshed = { articles: FIXTURE_ROWS.slice(1), index: 0 };
    await rerender({ shown: refreshed });
    expect(result.current.shown).toBe(refreshed);
  });

  test('with Remove animations on, the new chip’s rows show at once (Q17)', async () => {
    const { result, rerender } = await render(true);
    await rerender({ shown: verge });
    expect(result.current.shown).toBe(verge);
  });

  test('a chip that’s gone (a removed Feed) swaps at once, with no direction to move in', async () => {
    const { result, rerender } = await render();
    const gone = { articles: [], index: -1 };
    await rerender({ shown: gone });
    expect(result.current.shown).toBe(gone);
  });

  test('choosing again while the old rows leave lands on the latest chip', async () => {
    const { result, rerender } = await render();
    await rerender({ shown: verge });
    const calm = { articles: FIXTURE_ROWS.filter((row) => row.feedId !== 'f1'), index: 2 };
    await rerender({ shown: calm });
    await act(async () => jest.advanceTimersByTime(out + 50));
    expect(result.current.shown).toBe(calm);
  });
});
