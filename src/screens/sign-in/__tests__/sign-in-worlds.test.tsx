import { userEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Uniwind } from 'uniwind';

import TabsLayout from '@/app/(tabs)/_layout';
import FeedsRoute from '@/app/(tabs)/index';
import SavedRoute from '@/app/(tabs)/saved';
import AuthReturnRoute from '@/app/auth';
import GalleryRoute from '@/app/gallery';
import SignInRoute from '@/app/sign-in';
import { AppRoot } from '@/navigation/app-root';
import { SIGN_IN_WORLDS, type SignInWorldId } from '@/worlds/catalog';
import { createWorld, type World } from '@/worlds/world';
import { reanimatedReducesMotion } from '../../../../test/reduced-motion';

function renderWorld(world: World, initialUrl: string = world.initialUrl) {
  return renderRouter(
    {
      _layout: () => <AppRoot environment={world.environment} auth={world.auth} feeds={world.feeds} />,
      '(tabs)/_layout': TabsLayout,
      '(tabs)/index': FeedsRoute,
      '(tabs)/saved': SavedRoute,
      'sign-in': SignInRoute,
      auth: AuthReturnRoute,
      gallery: GalleryRoute,
    },
    { initialUrl },
  );
}

const NOT_ALLOWED = 'This Google account can’t use feedSmith yet.';
const FAILED = 'Couldn’t sign in. Check your connection and try again.';

type Shows = { busy: boolean; error: string | null; theme: 'dark' | 'light'; titleSize: number; reduceMotion: boolean };

const SHOWS: Record<SignInWorldId, Shows> = {
  'signed-out-dark': { busy: false, error: null, theme: 'dark', titleSize: 24, reduceMotion: false },
  'signed-out-light': { busy: false, error: null, theme: 'light', titleSize: 24, reduceMotion: false },
  'signing-in': { busy: true, error: null, theme: 'dark', titleSize: 24, reduceMotion: false },
  'not-allowed': { busy: false, error: NOT_ALLOWED, theme: 'dark', titleSize: 24, reduceMotion: false },
  failed: { busy: false, error: FAILED, theme: 'dark', titleSize: 24, reduceMotion: false },
  'sign-in-largest-font': { busy: false, error: null, theme: 'dark', titleSize: 48, reduceMotion: false },
  'sign-in-remove-animations': { busy: false, error: null, theme: 'dark', titleSize: 24, reduceMotion: true },
};

afterEach(() => Uniwind.setTheme('system'));

test.each(SIGN_IN_WORLDS)('$label', async ({ id, spec }) => {
  const world = createWorld(spec);
  const shows = SHOWS[id];
  await renderWorld(world);

  expect(await screen.findByRole('heading', { name: 'feedSmith' })).toHaveStyle({ fontSize: shows.titleSize });
  expect(screen.getByText('Your feeds, calm and readable.')).toBeOnTheScreen();
  const button = screen.getByRole('button', { name: 'Sign in with Google' });
  if (shows.busy) expect(button).toBeDisabled();
  else expect(button).toBeEnabled();
  if (shows.error) expect(screen.getByRole('alert')).toHaveTextContent(shows.error);
  else expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  expect(Uniwind.currentTheme).toBe(shows.theme);
  // Reanimated itself reduces motion exactly when the world's Remove animations is on (Q17).
  expect(reanimatedReducesMotion()).toBe(shows.reduceMotion);
  // Signed out, the sections stay out of reach.
  expect(screen.queryByRole('heading', { name: 'Feeds' })).not.toBeOnTheScreen();
  world.dispose();
});

test('pressing the button starts signing in with Google', async () => {
  const user = userEvent.setup();
  const world = createWorld({ colorScheme: 'dark', auth: 'signed-out' });
  await renderWorld(world);

  await user.press(await screen.findByRole('button', { name: 'Sign in with Google' }));

  expect(world.signInLog.starts).toBe(1);
  world.dispose();
});

test('a signed-in User lands in Feeds, not on sign-in', async () => {
  const world = createWorld({ colorScheme: 'dark', auth: 'signed-in' });
  await renderWorld(world, '/sign-in');

  expect(await screen.findByRole('heading', { name: 'Feeds' })).toBeOnTheScreen();
  expect(screen.queryByRole('heading', { name: 'feedSmith' })).not.toBeOnTheScreen();
  world.dispose();
});

test('the return link hands its code or error to sign-in, once', async () => {
  const world = createWorld({ colorScheme: 'dark', auth: 'signed-out' });
  await renderWorld(world, '/auth?convexAuthCode=abc123');

  expect(await screen.findByRole('heading', { name: 'feedSmith' })).toBeOnTheScreen();
  expect(world.signInLog.completions).toEqual([{ code: 'abc123' }]);
  world.dispose();
});
