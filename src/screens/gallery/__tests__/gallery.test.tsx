import { act, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Uniwind } from 'uniwind';

import FeedsRoute from '@/app/index';
import AuthReturnRoute from '@/app/auth';
import GalleryRoute from '@/app/gallery';
import SignInRoute from '@/app/sign-in';
import { AppRoot } from '@/navigation/app-root';
import { GALLERY } from '@/screens/gallery/registry';
import * as catalog from '@/worlds/catalog';
import { worldAuth, worldFeeds } from '@/worlds/world';

const routes = {
  _layout: () => <AppRoot auth={worldAuth({ colorScheme: 'dark' })} feeds={worldFeeds({ colorScheme: 'dark' })} />,
  index: FeedsRoute,
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
  await renderRouter(routes, { initialUrl: '/gallery?world=manage-dark' });

  expect(await screen.findByRole('heading', { name: 'State gallery' })).toBeOnTheScreen();
  expect(screen.getByRole('heading', { name: 'Manage Feeds' })).toBeOnTheScreen();
  expect(Uniwind.currentTheme).toBe('dark');
});

test('a second link into the open gallery switches to its world', async () => {
  await renderRouter(routes, { initialUrl: '/gallery?world=dark' });
  await screen.findByRole('heading', { name: 'State gallery' });

  await act(() => router.setParams({ world: 'manage-light' }));

  expect(screen.getByRole('radio', { name: 'Manage Feeds, light' })).toBeChecked();
  expect(screen.getByRole('heading', { name: 'Manage Feeds' })).toBeOnTheScreen();
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

test('an Account world with the sheet open shows it at once (FEE-35)', async () => {
  await renderRouter(routes, { initialUrl: '/gallery?world=account-sheet' });

  expect(await screen.findByRole('heading', { name: 'State gallery' })).toBeOnTheScreen();
  expect(screen.getByTestId('account-sheet')).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Sign out' })).toBeOnTheScreen();
});

test('capture mode shows only the world, filling the screen, for the visual check (FEE-70)', async () => {
  await renderRouter(routes, { initialUrl: '/gallery?world=manage-dark&theme=light&capture=1' });

  expect(await screen.findByRole('heading', { name: 'Manage Feeds' })).toBeOnTheScreen();
  expect(screen.queryByRole('heading', { name: 'State gallery' })).not.toBeOnTheScreen();
  expect(screen.queryByRole('radiogroup', { name: 'Theme' })).not.toBeOnTheScreen();
  expect(Uniwind.currentTheme).toBe('light');
});

test('every world in the catalog is in the gallery, once, so the visual check walks them all', () => {
  const inCatalog = Object.values(catalog).flatMap((worlds) => worlds.map((world) => world.id));
  const inGallery = GALLERY.flatMap((entry) => entry.worlds.map((world) => world.id));

  expect(inGallery.toSorted()).toEqual(inCatalog.toSorted());
  expect(new Set(inGallery).size).toBe(inGallery.length);
});

test('a link with parameters the gallery doesn\'t know falls back to its defaults (Q25)', async () => {
  await renderRouter(routes, { initialUrl: `/gallery?world=nope&theme=${'x'.repeat(500)}&capture=yes` });

  // Not capture mode, the first world, and its own theme.
  expect(await screen.findByRole('heading', { name: 'State gallery' })).toBeOnTheScreen();
  expect(screen.getByRole('radio', { name: 'Dark, Feeds' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  expect(Uniwind.currentTheme).toBe('dark');
});
