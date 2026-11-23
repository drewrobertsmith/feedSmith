import { act, render, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { AppSymbol } from '@/components/app-symbol';
import { EnvironmentProvider } from '@/environment';
import { worldEnvironment } from '@/worlds/world';

const SIZE = 16;

const original = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };
/** Android's font size setting, as the window reports it. */
const systemFontScale = (fontScale: number) =>
  act(() => Dimensions.set({ window: { ...original.window, fontScale }, screen: { ...original.screen, fontScale } }));

afterEach(() => act(() => Dimensions.set(original)));

async function renderSymbol(fontScale: number) {
  await render(
    <EnvironmentProvider environment={worldEnvironment({ colorScheme: 'dark', fontScale })}>
      <AppSymbol name={{ ios: 'line.3.horizontal', android: 'drag_indicator' }} size={SIZE} testID="symbol" />
    </EnvironmentProvider>,
  );
  const view = screen.getByTestId('symbol');
  return { view, size: view.props.size as number };
}

// On Android a symbol is a glyph of text, so Android's font size grows it on its own: the
// box has to grow by as much, or the glyph clips at the box's edges (FEE-39, Q16).
test("the box grows with Android's font size, as its glyph does, so the glyph is never clipped", async () => {
  await systemFontScale(2);
  const { view, size } = await renderSymbol(1);
  expect(size).toBe(SIZE); // Android grows this glyph to SIZE × 2 on its own
  expect(view).toHaveStyle({ width: SIZE * 2, height: SIZE * 2 });
});

test("and with a world's font scale, which the glyph only gets from its size", async () => {
  await systemFontScale(1);
  const { view, size } = await renderSymbol(2);
  expect(size).toBe(SIZE * 2);
  expect(view).toHaveStyle({ width: SIZE * 2, height: SIZE * 2 });
});
