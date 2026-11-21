import { renderRouter, screen } from 'expo-router/testing-library';
import { Uniwind } from 'uniwind';

import TabsLayout from '@/app/(tabs)/_layout';
import FeedsRoute from '@/app/(tabs)/index';
import SavedRoute from '@/app/(tabs)/saved';
import AuthReturnRoute from '@/app/auth';
import GalleryRoute from '@/app/gallery';
import SignInRoute from '@/app/sign-in';
import { MotionConfig } from '@/environment/motion-config';
import { AppRoot } from '@/navigation/app-root';
import { SHELL_WORLDS, type ShellWorldId } from '@/worlds/catalog';
import { createWorld } from '@/worlds/world';

type Shows = {
  heading: 'Feeds' | 'Saved';
  message: RegExp;
  theme: 'dark' | 'light';
  titleSize: number;
  reduceMotion: boolean;
};

const FEEDS = /Add a Feed to see its Articles here/;
const SAVED = /Articles you Save wait here until you mark them Done/;

const SHOWS: Record<ShellWorldId, Shows> = {
  dark: { heading: 'Feeds', message: FEEDS, theme: 'dark', titleSize: 24, reduceMotion: false },
  light: { heading: 'Feeds', message: FEEDS, theme: 'light', titleSize: 24, reduceMotion: false },
  'dark-saved': { heading: 'Saved', message: SAVED, theme: 'dark', titleSize: 24, reduceMotion: false },
  'light-saved': { heading: 'Saved', message: SAVED, theme: 'light', titleSize: 24, reduceMotion: false },
  'largest-font': { heading: 'Feeds', message: FEEDS, theme: 'dark', titleSize: 48, reduceMotion: false },
  'remove-animations': { heading: 'Feeds', message: FEEDS, theme: 'dark', titleSize: 24, reduceMotion: true },
};

test.each(SHELL_WORLDS)('$label', async ({ id, spec }) => {
  const world = createWorld(spec);
  const shows = SHOWS[id];

  await renderRouter(
    {
      _layout: () => <AppRoot environment={world.environment} auth={world.auth} feeds={world.feeds} />,
      '(tabs)/_layout': TabsLayout,
      '(tabs)/index': FeedsRoute,
      '(tabs)/saved': SavedRoute,
      gallery: GalleryRoute,
      'sign-in': SignInRoute,
      auth: AuthReturnRoute,
    },
    { initialUrl: world.initialUrl },
  );

  expect(await screen.findByRole('heading', { name: shows.heading })).toHaveStyle({ fontSize: shows.titleSize });
  expect(screen.getByText(shows.message)).toBeOnTheScreen();
  expect(Uniwind.currentTheme).toBe(shows.theme);
  expect(jest.mocked(MotionConfig)).toHaveBeenLastCalledWith({ reduceMotion: shows.reduceMotion }, undefined);

  world.dispose();
});

test('disposing a world hands the theme back to the phone', () => {
  const world = createWorld({ colorScheme: 'light' });
  expect(Uniwind.hasAdaptiveThemes).toBe(false);

  world.dispose();
  expect(Uniwind.hasAdaptiveThemes).toBe(true);
});
