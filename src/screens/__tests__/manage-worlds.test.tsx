import { act, userEvent, within } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Alert } from 'react-native';
import { Uniwind } from 'uniwind';

import FeedsRoute from '@/app/index';
import ArticleRoute from '@/app/article/[id]';
import ManageFeedsRoute from '@/app/manage-feeds';
import { NativeSheet } from '@/components/native-sheet';
import { AppRoot } from '@/navigation/app-root';
import { MANAGE_WORLDS, type ManageWorldId } from '@/worlds/catalog';
import { FIXTURE_MANAGE } from '@/worlds/fixtures';
import { createWorld, type World, type WorldSpec } from '@/worlds/world';

let world: World | undefined;
async function open(spec: WorldSpec) {
  world = createWorld(spec);
  const w = world;
  await renderRouter(
    {
      _layout: () => <AppRoot environment={w.environment} auth={w.auth} feeds={w.feeds} />,
      index: FeedsRoute,
      'article/[id]': ArticleRoute,
      'manage-feeds': ManageFeedsRoute,
    },
    { initialUrl: w.initialUrl },
  );
  return w;
}
// The sheet's calls would otherwise carry over from the test before (the Account sheet's).
beforeEach(() => jest.mocked(NativeSheet).mockClear());
afterEach(() => {
  world?.dispose();
  world = undefined;
});

describe('Manage Feeds worlds', () => {
  /** `rename`: the rename sheet's title size, and what tapping Save leaves (`null`: saved and closed). */
  type Rename = { titleSize: number; problem: string | null };
  type Shows = {
    feeds: number;
    empty: boolean;
    theme: 'dark' | 'light';
    titleSize: number;
    rename: Rename | null;
  };
  const SAVED: Rename = { titleSize: 24, problem: null };
  const SHOWS: Record<ManageWorldId, Shows> = {
    'manage-dark': { feeds: 3, empty: false, theme: 'dark', titleSize: 24, rename: null },
    'manage-light': { feeds: 3, empty: false, theme: 'light', titleSize: 24, rename: null },
    'manage-empty': { feeds: 0, empty: true, theme: 'dark', titleSize: 24, rename: null },
    'manage-loading': { feeds: 0, empty: false, theme: 'dark', titleSize: 24, rename: null },
    'manage-largest-font': { feeds: 3, empty: false, theme: 'dark', titleSize: 48, rename: null },
    'manage-rename': { feeds: 3, empty: false, theme: 'dark', titleSize: 24, rename: SAVED },
    'manage-rename-light': { feeds: 3, empty: false, theme: 'light', titleSize: 24, rename: SAVED },
    'manage-rename-largest-font': {
      feeds: 3,
      empty: false,
      theme: 'dark',
      titleSize: 48,
      rename: { titleSize: 48, problem: null },
    },
    'manage-rename-invalid': {
      feeds: 3,
      empty: false,
      theme: 'dark',
      titleSize: 24,
      rename: { titleSize: 24, problem: 'Give the Feed a name of up to 100 characters.' },
    },
    'manage-rename-failed': {
      feeds: 3,
      empty: false,
      theme: 'light',
      titleSize: 24,
      rename: { titleSize: 24, problem: "Couldn't save the name. Check your connection and try again." },
    },
  };

  test.each(MANAGE_WORLDS)('$label', async ({ id, spec }) => {
    const shows = SHOWS[id];
    await open(spec);
    expect(await screen.findByRole('heading', { name: 'Manage Feeds' })).toHaveStyle({ fontSize: shows.titleSize });
    expect(screen.queryAllByRole('button', { name: /^Rename / })).toHaveLength(shows.feeds);
    // Pinning and ordering Pins are gone (FEE-94).
    expect(screen.queryAllByRole('button', { name: /^(Pin|Unpin) / })).toHaveLength(0);
    expect(screen.queryAllByRole('adjustable', { name: /^Reorder / })).toHaveLength(0);
    if (shows.empty) expect(screen.getByText('No Feeds yet. Add one from the + on Feeds.')).toBeOnTheScreen();
    expect(Uniwind.currentTheme).toBe(shows.theme);

    if (!shows.rename) return;
    const user = userEvent.setup();
    await user.press(screen.getByRole('button', { name: 'Rename Calm Notes' }));
    const sheet = screen.getByTestId('rename-sheet');
    expect(within(sheet).getByRole('heading', { name: 'Rename Calm Notes' })).toHaveStyle({ fontSize: shows.rename.titleSize });
    await user.type(within(sheet).getByLabelText('New name for Calm Notes'), ' Daily');
    await user.press(within(sheet).getByRole('button', { name: 'Save name' }));
    if (shows.rename.problem === null) {
      expect(jest.mocked(NativeSheet)).toHaveBeenLastCalledWith(expect.objectContaining({ open: false }), undefined);
      return;
    }
    // Refused or failed: the sheet stays open, says why, and keeps the name to try again (Q5).
    expect(await within(sheet).findByRole('alert')).toHaveTextContent(shows.rename.problem);
    expect(jest.mocked(NativeSheet)).toHaveBeenLastCalledWith(expect.objectContaining({ open: true }), undefined);
    expect(within(sheet).getByLabelText('New name for Calm Notes')).toHaveDisplayValue('Calm Notes Daily');
  });
});

describe('Manage Feeds', () => {
  test('opens from the Account sheet (D17)', async () => {
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', feeds: 'some' });
    const bar = await screen.findByTestId('top-bar-Feeds');
    await user.press(within(bar).getByRole('button', { name: /^Account/ }));
    await user.press(within(screen.getByTestId('account-sheet')).getByRole('button', { name: 'Manage Feeds' }));
    expect(await screen.findByRole('heading', { name: 'Manage Feeds' })).toBeOnTheScreen();
  });

  test("each Feed shows its name and site, never its URL (Q9)", async () => {
    await open({ colorScheme: 'dark', section: 'manage' });
    expect(await screen.findByText('The Verge')).toBeOnTheScreen();
    expect(screen.getByText('www.theverge.com')).toBeOnTheScreen();
  });

  test('a Feed that stopped working shows a quiet warning here (P15), and not on Feeds', async () => {
    await open({ colorScheme: 'dark', section: 'manage' });
    expect(await screen.findByText('Not working; feedSmith keeps trying.')).toBeOnTheScreen();
    world!.dispose();
    await open({ colorScheme: 'dark', feeds: 'some' });
    await screen.findByRole('heading', { name: 'Feeds' });
    expect(screen.queryByText(/Not working/)).not.toBeOnTheScreen();
  });

  test('Rename opens a sheet over the list, titled with the Feed (Q32)', async () => {
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', section: 'manage' });
    await user.press(await screen.findByRole('button', { name: 'Rename Calm Notes' }));
    expect(jest.mocked(NativeSheet)).toHaveBeenLastCalledWith(expect.objectContaining({ open: true }), undefined);
    const sheet = screen.getByTestId('rename-sheet');
    expect(within(sheet).getByRole('heading', { name: 'Rename Calm Notes' })).toBeOnTheScreen();
    expect(within(sheet).getByLabelText('New name for Calm Notes')).toHaveDisplayValue('Calm Notes');
    // The list stays where it was, behind the sheet.
    expect(screen.getByRole('heading', { name: 'Manage Feeds' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Rename The Verge' })).toBeOnTheScreen();
  });

  test('renaming a Feed saves the new name, and closes the sheet', async () => {
    const user = userEvent.setup();
    const w = await open({ colorScheme: 'dark', section: 'manage' });
    await user.press(await screen.findByRole('button', { name: 'Rename Calm Notes' }));
    const field = screen.getByLabelText('New name for Calm Notes');
    await user.clear(field);
    await user.type(field, 'Calm');
    await user.press(screen.getByRole('button', { name: 'Save name' }));
    expect(w.feedsLog.renames).toEqual([{ id: 'f2', title: 'Calm' }]);
    expect(jest.mocked(NativeSheet)).toHaveBeenLastCalledWith(expect.objectContaining({ open: false }), undefined);
  });

  test('Cancel and closing the sheet (swipe, tap outside, back) rename nothing', async () => {
    const user = userEvent.setup();
    const w = await open({ colorScheme: 'dark', section: 'manage' });
    await user.press(await screen.findByRole('button', { name: 'Rename Calm Notes' }));
    await user.type(screen.getByLabelText('New name for Calm Notes'), ' Daily');
    await user.press(screen.getByRole('button', { name: 'Cancel renaming' }));
    expect(jest.mocked(NativeSheet)).toHaveBeenLastCalledWith(expect.objectContaining({ open: false }), undefined);

    // Reopened, it starts from the Feed's name again; the native sheet reports every dismissal as onClose.
    await user.press(screen.getByRole('button', { name: 'Rename Calm Notes' }));
    expect(screen.getByLabelText('New name for Calm Notes')).toHaveDisplayValue('Calm Notes');
    await act(async () => jest.mocked(NativeSheet).mock.lastCall![0].onClose());
    expect(jest.mocked(NativeSheet)).toHaveBeenLastCalledWith(expect.objectContaining({ open: false }), undefined);
    expect(w.feedsLog.renames).toEqual([]);
  });

  test('removing a Feed asks first, saying its Articles go too, then removes it', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const user = userEvent.setup();
    const w = await open({ colorScheme: 'dark', section: 'manage' });
    await user.press(await screen.findByRole('button', { name: 'Remove Calm Notes' }));
    expect(w.feedsLog.removed).toEqual([]);
    const [title, message, buttons] = alert.mock.calls[0];
    expect(title).toBe('Remove Calm Notes?');
    expect(message).toBe('Its Articles go too.');
    const remove = buttons!.find((b) => b.text === 'Remove')!;
    expect(remove.style).toBe('destructive');
    await act(async () => remove.onPress!());
    expect(w.feedsLog.removed).toEqual(['f2']);
    alert.mockRestore();
  });

  test("a save that finishes after its sheet was closed doesn't close the next Feed's sheet", async () => {
    const user = userEvent.setup();
    const w = await open({ colorScheme: 'dark', section: 'manage' });
    // Calm Notes' rename is still reaching the server (offline, say) when the User moves on.
    let finish: (outcome: 'ok') => void = () => {};
    const actions = w.feeds.useManageActions;
    w.feeds.useManageActions = () => ({ ...actions(), rename: () => new Promise((resolve) => (finish = resolve)) });
    await user.press(await screen.findByRole('button', { name: 'Rename Calm Notes' }));
    await user.press(screen.getByRole('button', { name: 'Save name' }));
    await act(async () => jest.mocked(NativeSheet).mock.lastCall![0].onClose());
    await user.press(screen.getByRole('button', { name: 'Rename The Verge' }));

    await act(async () => finish('ok'));

    expect(jest.mocked(NativeSheet)).toHaveBeenLastCalledWith(expect.objectContaining({ open: true }), undefined);
    expect(within(screen.getByTestId('rename-sheet')).getByRole('heading', { name: 'Rename The Verge' })).toBeOnTheScreen();
  });

  test("a row's actions are Rename, then Remove last; no Pin (Q32, FEE-94)", async () => {
    await open({ colorScheme: 'dark', section: 'manage' });
    await screen.findByText('Calm Notes');
    // TalkBack meets them in this order, by these names (Q15). Remove's brick and its divider are
    // in the visual check's pictures: class names don't resolve to styles under Jest.
    const actions = screen
      .getAllByRole('button', { name: /^(Rename|Pin|Unpin|Remove) Calm Notes$/ })
      .map((button) => button.props.accessibilityLabel);
    expect(actions).toEqual(['Rename Calm Notes', 'Remove Calm Notes']);
  });

  test("a row's actions each stay reachable on their own, not folded into the row (Q15)", async () => {
    await open({ colorScheme: 'dark', section: 'manage', });
    const rename = await screen.findByRole('button', { name: 'Rename The Verge' });
    // No ancestor groups the row into one TalkBack stop that would swallow its buttons.
    for (let node = rename.parent; node; node = node.parent) expect(node.props.accessible).not.toBe(true);
  });

  test("a rename that doesn't reach the server says so, and keeps the name to try again (Q5)", async () => {
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', section: 'manage', manageWrites: 'fail' });
    await user.press(await screen.findByRole('button', { name: 'Rename Calm Notes' }));
    await user.type(screen.getByLabelText('New name for Calm Notes'), ' Daily');
    await user.press(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByText("Couldn't save the name. Check your connection and try again.")).toBeOnTheScreen();
    expect(screen.getByLabelText('New name for Calm Notes')).toHaveDisplayValue('Calm Notes Daily');
  });

  test("a remove that doesn't reach the server says so (Q5)", async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', section: 'manage', manageWrites: 'fail' });
    await user.press(await screen.findByRole('button', { name: 'Remove Calm Notes' }));
    const remove = alert.mock.calls[0][2]!.find((b) => b.text === 'Remove')!;
    await act(async () => remove.onPress!());
    expect(within(await screen.findByTestId('undo-toast')).getByText("Couldn't remove Calm Notes. Try again.")).toBeOnTheScreen();
    alert.mockRestore();
  });

  test('a name past the limit is refused, saying the limit', async () => {
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', section: 'manage', manageWrites: 'invalid' });
    await user.press(await screen.findByRole('button', { name: 'Rename Calm Notes' }));
    await user.press(screen.getByRole('button', { name: 'Save name' }));
    expect(await screen.findByText('Give the Feed a name of up to 100 characters.')).toBeOnTheScreen();
  });

  test('every Feed in the list is there, by name', async () => {
    await open({ colorScheme: 'dark', section: 'manage' });
    for (const feed of FIXTURE_MANAGE) expect(await screen.findByText(feed.title)).toBeOnTheScreen();
  });
});
