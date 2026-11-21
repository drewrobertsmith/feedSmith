import { act, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Uniwind } from 'uniwind';

import TabsLayout from '@/app/(tabs)/_layout';
import FeedsRoute from '@/app/(tabs)/index';
import SavedRoute from '@/app/(tabs)/saved';
import AuthReturnRoute from '@/app/auth';
import GalleryRoute from '@/app/gallery';
import SignInRoute from '@/app/sign-in';
import { AppRoot } from '@/navigation/app-root';
import { worldAuth, worldFeeds } from '@/worlds/world';

const routes = {
  _layout: () => <AppRoot auth={worldAuth({ colorScheme: 'dark' })} feeds={worldFeeds({ colorScheme: 'dark' })} />,
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': FeedsRoute,
  '(tabs)/saved': SavedRoute,
  gallery: GalleryRoute,
  'sign-in': SignInRoute,
  auth: AuthReturnRoute,
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

test('a second link into the open gallery switches to its world', async () => {
  await renderRouter(routes, { initialUrl: '/gallery?world=dark' });
  await screen.findByRole('heading', { name: 'State gallery' });

  await act(() => router.setParams({ world: 'light-saved' }));

  expect(screen.getByRole('radio', { name: 'Light, Saved' })).toBeChecked();
  expect(screen.getByRole('heading', { name: 'Saved' })).toBeOnTheScreen();
  expect(Uniwind.currentTheme).toBe('light');
});

test('lists every shell world, and picking one shows it', async () => {
  const user = userEvent.setup();
  await renderRouter(routes, { initialUrl: '/gallery' });

  await user.press(await screen.findByRole('radio', { name: 'Largest font size' }));

  expect(screen.getByRole('radio', { name: 'Largest font size' })).toBeChecked();
  expect(screen.getByRole('heading', { name: 'Feeds' })).toHaveStyle({ fontSize: 48 });
});

test('the light and dark toggle switches the world’s theme', async () => {
  const user = userEvent.setup();
  await renderRouter(routes, { initialUrl: '/gallery?world=dark' });

  await user.press(await screen.findByRole('radio', { name: 'Light' }));

  expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
  expect(Uniwind.currentTheme).toBe('light');
});
