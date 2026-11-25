import { faceOf } from '../../../test/depth';
import { depthStyle } from '@/theme/depth';
import { act, userEvent, within } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Alert } from 'react-native';
import { Uniwind } from 'uniwind';

import FeedsRoute from '@/app/index';
import ManageFeedsRoute from '@/app/manage-feeds';
import SignInRoute from '@/app/sign-in';
import { NativeSheet } from '@/components/native-sheet';
import { AppRoot } from '@/navigation/app-root';
import { ACCOUNT_WORLDS, type AccountWorldId } from '@/worlds/catalog';
import { createWorld, type World } from '@/worlds/world';
import { reanimatedReducesMotion } from '../../../test/reduced-motion';

type Shows = {
  theme: 'dark' | 'light';
  section: 'Feeds';
  /** What TalkBack hears for the circle (Q15). */
  circle: string;
  initial: string;
  /** The sheet's content, once the circle is tapped; `null` for the worlds that only show the circle. */
  sheet: { title: string; email?: string; signingOut: boolean; deletion: 'idle' | 'deleting' | 'failed' } | null;
  fontScale: number;
  reduceMotion: boolean;
};

const ADA = 'Account, Ada Lovelace';
const OPEN = { title: 'Ada Lovelace', email: 'ada@example.com', signingOut: false, deletion: 'idle' } as const;

const SHOWS: Record<AccountWorldId, Shows> = {
  'account-circle-dark': { theme: 'dark', section: 'Feeds', circle: ADA, initial: 'A', sheet: null, fontScale: 1, reduceMotion: false },
  'account-circle-light': { theme: 'light', section: 'Feeds', circle: ADA, initial: 'A', sheet: null, fontScale: 1, reduceMotion: false },
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
  'account-no-server': { theme: 'dark', section: 'Feeds', circle: ADA, initial: 'A', sheet: OPEN, fontScale: 1, reduceMotion: false },
  // Google gave no name: the email stands in, for the circle's letter and for TalkBack.
  'account-no-name': {
    theme: 'light',
    section: 'Feeds',
    circle: 'Account, ada@example.com',
    initial: 'A',
    sheet: { title: 'ada@example.com', signingOut: false, deletion: 'idle' },
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
  // The confirmation itself is Android's own dialog: the test presses Delete account to reach it.
  'account-delete-confirm': { theme: 'dark', section: 'Feeds', circle: ADA, initial: 'A', sheet: OPEN, fontScale: 1, reduceMotion: false },
  'account-deleting': {
    theme: 'dark',
    section: 'Feeds',
    circle: ADA,
    initial: 'A',
    sheet: { ...OPEN, deletion: 'deleting' },
    fontScale: 1,
    reduceMotion: false,
  },
  'account-delete-failed': {
    theme: 'light',
    section: 'Feeds',
    circle: ADA,
    initial: 'A',
    sheet: { ...OPEN, deletion: 'failed' },
    fontScale: 1,
    reduceMotion: false,
  },
};

const FAILED = "Couldn't delete your account. Check your connection and try again.";

function renderWorld(world: World) {
  return renderRouter(
    {
      _layout: () => <AppRoot environment={world.environment} auth={world.auth} feeds={world.feeds} />,
      index: FeedsRoute,
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
    // Reanimated itself reduces motion exactly when the world's Remove animations is on (Q17).
    expect(reanimatedReducesMotion()).toBe(shows.reduceMotion);

    world.dispose();
  });

  test('the circle is soft, like the chips beside it (FEE-75, D27)', async () => {
    const world = createWorld(spec);
    await renderWorld(world);
    expect(faceOf(await circle(shows))).toMatchObject(depthStyle(shows.theme, 'soft'));
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
    const deleteRow = within(sheet()).getByRole('button', { name: open.deletion === 'deleting' ? 'Deleting account' : 'Delete account' });
    if (open.deletion === 'deleting') {
      expect(deleteRow).toBeBusy();
      expect(deleteRow).toBeDisabled();
    } else {
      expect(deleteRow).not.toBeBusy();
      expect(deleteRow).toBeEnabled();
    }
    // A failure says what happened and what to do, and the User stays signed in (P18).
    if (open.deletion === 'failed') expect(within(sheet()).getByRole('alert')).toHaveTextContent(FAILED);
    else expect(within(sheet()).queryByText(FAILED)).toBeNull();
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

  if (open.deletion !== 'deleting') {
    test('Delete account asks first, with a native confirmation; Cancel deletes nothing', async () => {
      const world = createWorld(spec);
      const alert = jest.spyOn(Alert, 'alert');
      await renderWorld(world);
      await userEvent.press(await circle(shows));

      await userEvent.press(within(sheet()).getByRole('button', { name: 'Delete account' }));

      expect(alert).toHaveBeenCalledTimes(1);
      const [title, message, buttons] = alert.mock.calls[0];
      expect(title).toBe('Delete your account and everything in it?');
      expect(message).toBe("This can't be undone.");
      expect(buttons?.map((button) => [button.text, button.style])).toEqual([
        ['Cancel', 'cancel'],
        ['Delete', 'destructive'],
      ]);
      await act(async () => buttons?.[0].onPress?.());
      expect(world.signInLog.deletes).toBe(0);

      await act(async () => buttons?.[1].onPress?.());
      expect(world.signInLog.deletes).toBe(1);

      alert.mockRestore();
      world.dispose();
    });
  }

  if (open.signingOut) return;

  test('Sign out signs out once, server or not', async () => {
    const world = createWorld(spec);
    await renderWorld(world);
    await userEvent.press(await circle(shows));

    const alertsBefore = screen.queryAllByRole('alert').length;
    await userEvent.press(within(sheet()).getByRole('button', { name: 'Sign out' }));

    expect(world.signInLog.signOuts).toBe(1);
    // Signing out never shows an error of its own, server or not.
    expect(screen.queryAllByRole('alert')).toHaveLength(alertsBefore);

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
