import { userEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Uniwind } from 'uniwind';

import TabsLayout from '@/app/(tabs)/_layout';
import FeedsRoute from '@/app/(tabs)/index';
import SavedRoute from '@/app/(tabs)/saved';
import GalleryRoute from '@/app/gallery';
import { AppRoot } from '@/navigation/app-root';

const routes = {
  _layout: () => <AppRoot />,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': FeedsRoute,
  '(tabs)/saved': SavedRoute,
  gallery: GalleryRoute,
};

const setDev = (value: boolean) => {
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = value;
};

afterEach(() => {
  setDev(true);
  Uniwind.setTheme('system');
});

test('a release build never opens the gallery, even from its deep link', async () => {
  setDev(false);

  await renderRouter(routes, { initialUrl: '/gallery' });

  expect(screen.queryByRole('heading', { name: 'State gallery' })).not.toBeOnTheScreen();
});

test('renders the real screen for the world named in the link', async () => {
  await renderRouter(routes, { initialUrl: '/gallery?world=dark-saved' });

  expect(await screen.findByRole('heading', { name: 'State gallery' })).toBeOnTheScreen();
  expect(screen.getByRole('heading', { name: 'Saved' })).toBeOnTheScreen();
  expect(Uniwind.currentTheme).toBe('dark');
});

test('lists every shell world, and picking one shows it', async () => {
  const user = userEvent.setup();
  await renderRouter(routes, { initialUrl: '/gallery' });

  await user.press(await screen.findByRole('button', { name: 'Largest font size' }));

  expect(screen.getByRole('button', { name: 'Largest font size' })).toBeSelected();
  expect(screen.getByRole('heading', { name: 'Feeds' })).toHaveStyle({ fontSize: 48 });
});

test('the light and dark toggle switches the world’s theme', async () => {
  const user = userEvent.setup();
  await renderRouter(routes, { initialUrl: '/gallery?world=dark' });

  await user.press(await screen.findByRole('button', { name: 'Light' }));

  expect(screen.getByRole('button', { name: 'Light' })).toBeSelected();
  expect(Uniwind.currentTheme).toBe('light');
});
