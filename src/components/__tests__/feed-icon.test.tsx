import { act, render, screen } from '@testing-library/react-native';
import { Dimensions } from 'react-native';

import { FeedIcon } from '@/components/feed-icon';
import { EnvironmentProvider } from '@/environment';
import { worldEnvironment } from '@/worlds/world';

const SIZE = 20;

const original = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };
/** Android's font size setting, as the window reports it. */
const systemFontScale = (fontScale: number) =>
  act(() => Dimensions.set({ window: { ...original.window, fontScale }, screen: { ...original.screen, fontScale } }));

function renderIcon(fontScale: number) {
  return render(
    <EnvironmentProvider environment={worldEnvironment({ colorScheme: 'dark', fontScale })}>
      <FeedIcon title="Farnam Street" size={SIZE} testID="icon" />
    </EnvironmentProvider>,
  );
}

const tile = () => screen.getByTestId('icon-initial');

afterEach(() => act(() => Dimensions.set(original)));

test("the initial's tile grows with Android's font size, so the letter is never clipped (Q16)", async () => {
  await systemFontScale(2);
  await renderIcon(1);
  expect(tile()).toHaveStyle({ width: SIZE * 2, height: SIZE * 2 });
});

test("and with a world's font scale, as in the state gallery", async () => {
  await systemFontScale(1);
  await renderIcon(2);
  expect(tile()).toHaveStyle({ width: SIZE * 2, height: SIZE * 2 });
});
