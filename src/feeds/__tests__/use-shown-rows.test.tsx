import { renderHook } from '@testing-library/react-native';

import type { AllView } from '@/feeds/feeds-data';
import { useShownRows } from '@/feeds/use-shown-rows';

const rowsOf = (...ids: string[]) =>
  ids.map((id) => ({ id, feedId: 'f1', title: id, feedTitle: 'F', publishedAt: 0, read: false, saved: false }));

describe("while a chosen Feed's rows load, the list keeps showing the last ones (FEE-42)", () => {
  test('ready rows are shown, for the chip they belong to', async () => {
    const { result } = await renderHook(() => useShownRows({ status: 'ready', articles: rowsOf('a') }, 0));
    expect(result.current).toEqual({ articles: rowsOf('a'), index: 0 });
  });

  test("switching chips keeps the old rows, and the old chip's place, until the new ones are ready", async () => {
    const { result, rerender } = await renderHook(({ view, index }: { view: AllView; index: number }) => useShownRows(view, index), {
      initialProps: { view: { status: 'ready', articles: rowsOf('a', 'b') } as AllView, index: 0 },
    });
    await rerender({ view: { status: 'loading' }, index: 2 });
    expect(result.current).toEqual({ articles: rowsOf('a', 'b'), index: 0 });
    await rerender({ view: { status: 'ready', articles: rowsOf('c') }, index: 2 });
    expect(result.current).toEqual({ articles: rowsOf('c'), index: 2 });
  });

  test('a source that builds a new array each render, around the same rows, settles (no render loop)', async () => {
    const rows = rowsOf('a');
    const { result } = await renderHook(() => useShownRows({ status: 'ready', articles: [...rows] }, 0));
    expect(result.current.articles).toEqual(rows);
  });

  test('before anything has loaded, there are no rows', async () => {
    const { result } = await renderHook(() => useShownRows({ status: 'loading' }, 0));
    expect(result.current).toEqual({ articles: [], index: 0 });
  });
});
