import { act, userEvent, within } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Uniwind } from 'uniwind';

import TabsLayout from '@/app/(tabs)/_layout';
import FeedsRoute from '@/app/(tabs)/index';
import SavedRoute from '@/app/(tabs)/saved';
import ManageFeedsRoute from '@/app/manage-feeds';
import SignInRoute from '@/app/sign-in';
import { NativeSheet } from '@/components/native-sheet';
import { MotionConfig } from '@/environment/motion-config';
import { AppRoot } from '@/navigation/app-root';
import { ACCOUNT_WORLDS, type AccountWorldId } from '@/worlds/catalog';
import { createWorld, type World } from '@/worlds/world';

type Shows = {
  theme: 'dark' | 'light';
  section: 'Feeds' | 'Saved';
  /** What TalkBack hears for the circle (Q15). */
  circle: string;
  initial: string;
  /** The sheet's content, once the circle is tapped; `null` for the worlds that only show the circle. */
  sheet: { title: string; email?: string; signingOut: boolean } | null;
  fontScale: number;
  reduceMotion: boolean;
};

const ADA = 'Account, Ada Lovelace';
const OPEN = { title: 'Ada Lovelace', email: 'ada@example.com', signingOut: false };

const SHOWS: Record<AccountWorldId, Shows> = {
  'account-circle-dark': { theme: 'dark', section: 'Feeds', circle: ADA, initial: 'A', sheet: null, fontScale: 1, reduceMotion: false },
  'account-circle-light': { theme: 'light', section: 'Saved', circle: ADA, initial: 'A', sheet: null, fontScale: 1, reduceMotion: false },
  'account-sheet': { theme: 'dark', section: 'Feeds', circle: ADA, initial: 'A', sheet: OPEN, fontScale: 1, reduceMotion: false },
  'account-signing-out': {
    theme: 'dark',
    section: 'Feeds',
    circle: ADA,
    initial: 'A',
    sheet: { ...OPEN, signingOut: true },
    fontScale: 1,
    reduceMotion: false,
  },
  'account-no-server': { theme: 'dark', section: 'Saved', circle: ADA, initial: 'A', sheet: OPEN, fontScale: 1, reduceMotion: false },
  // Google gave no name: the email stands in, for the circle's letter and for TalkBack.
  'account-no-name': {
    theme: 'light',
    section: 'Feeds',
    circle: 'Account, ada@example.com',
    initial: 'A',
    sheet: { title: 'ada@example.com', signingOut: false },
    fontScale: 1,
    reduceMotion: false,
  },
  'account-largest-font': { theme: 'dark', section: 'Feeds', circle: ADA, initial: 'A', sheet: OPEN, fontScale: 2, reduceMotion: false },
  'account-remove-animations': {
    theme: 'dark',
    section: 'Feeds',
    circle: ADA,
    initial: 'A',
    sheet: OPEN,
    fontScale: 1,
    reduceMotion: true,
  },
};

function renderWorld(world: World) {
  return renderRouter(
    {
      _layout: () => <AppRoot environment={world.environment} auth={world.auth} feeds={world.feeds} />,
      '(tabs)/_layout': TabsLayout,
      '(tabs)/index': FeedsRoute,
      '(tabs)/saved': SavedRoute,
      'manage-feeds': ManageFeedsRoute,
      'sign-in': SignInRoute,
    },
    { initialUrl: world.initialUrl },
  );
}

const sheet = () => screen.getByTestId('account-sheet');

/** Both tabs are mounted, as on a phone: the circle is the one in the shown section's top bar. */
async function circle(shows: Shows) {
  const bar = await screen.findByTestId(`top-bar-${shows.section}`);
  return within(bar).getByRole('button', { name: shows.circle });
}

describe.each(ACCOUNT_WORLDS)('$label', ({ id, spec }) => {
  const shows = SHOWS[id];

  test('the top bar holds the title and the account circle (Q31)', async () => {
    const world = createWorld(spec);
    await renderWorld(world);

    const bar = await screen.findByTestId(`top-bar-${shows.section}`);
    expect(within(bar).getByRole('heading', { name: shows.section })).toHaveStyle({ fontSize: 24 * shows.fontScale });
    expect(within(await circle(shows)).getByText(shows.initial)).toBeOnTheScreen();
    // Manage Feeds lives in the Account sheet now, not the top bar (D17).
    expect(screen.queryByRole('button', { name: 'Manage Feeds' })).toBeNull();
    expect(screen.queryByTestId('account-sheet')).toBeNull();
    expect(Uniwind.currentTheme).toBe(shows.theme);
    expect(jest.mocked(MotionConfig)).toHaveBeenLastCalledWith({ reduceMotion: shows.reduceMotion }, undefined);

    world.dispose();
  });

  if (shows.sheet === null) return;
  const open = shows.sheet;

  test('tapping the circle opens the Account sheet', async () => {
    const world = createWorld(spec);
    await renderWorld(world);

    await userEvent.press(await circle(shows));

    expect(jest.mocked(NativeSheet)).toHaveBeenLastCalledWith(expect.objectContaining({ open: true }), undefined);
    expect(within(sheet()).getByRole('heading', { name: open.title })).toBeOnTheScreen();
    if (open.email) expect(within(sheet()).getByText(open.email)).toBeOnTheScreen();
    expect(within(sheet()).getByRole('button', { name: 'Manage Feeds' })).toBeOnTheScreen();
    const signOut = within(sheet()).getByRole('button', { name: open.signingOut ? 'Signing out' : 'Sign out' });
    if (open.signingOut) {
      expect(signOut).toBeBusy();
      expect(signOut).toBeDisabled();
    } else {
      expect(signOut).not.toBeBusy();
      expect(signOut).toBeEnabled();
    }

    world.dispose();
  });

  test('closing the sheet (swipe, tap outside, back) puts the section back', async () => {
    const world = createWorld(spec);
    await renderWorld(world);
    await userEvent.press(await circle(shows));

    // The native sheet reports every kind of dismissal the same way.
    const { onClose } = jest.mocked(NativeSheet).mock.lastCall![0];
    await act(async () => onClose());

    expect(jest.mocked(NativeSheet)).toHaveBeenLastCalledWith(expect.objectContaining({ open: false }), undefined);
    expect(within(screen.getByTestId(`top-bar-${shows.section}`)).getByRole('heading', { name: shows.section })).toBeOnTheScreen();

    world.dispose();
  });

  if (open.signingOut) return;

  test('Sign out signs out once, server or not', async () => {
    const world = createWorld(spec);
    await renderWorld(world);
    await userEvent.press(await circle(shows));

    await userEvent.press(within(sheet()).getByRole('button', { name: 'Sign out' }));

    expect(world.signInLog.signOuts).toBe(1);
    expect(screen.queryByText(/error|couldn/i)).toBeNull();

    world.dispose();
  });

  test('Manage Feeds closes the sheet and opens Manage Feeds', async () => {
    const world = createWorld(spec);
    await renderWorld(world);
    await userEvent.press(await circle(shows));

    await userEvent.press(within(sheet()).getByRole('button', { name: 'Manage Feeds' }));

    expect(await screen.findByRole('heading', { name: 'Manage Feeds' })).toBeOnTheScreen();
    expect(screen.queryByTestId('account-sheet')).toBeNull();

    world.dispose();
  });
});
