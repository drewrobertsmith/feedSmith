import { act, fireEvent, userEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Alert, ToastAndroid } from 'react-native';
import { Uniwind } from 'uniwind';

import TabsLayout from '@/app/(tabs)/_layout';
import FeedsRoute from '@/app/(tabs)/index';
import SavedRoute from '@/app/(tabs)/saved';
import AddFeedRoute from '@/app/add-feed';
import ArticleRoute from '@/app/article/[id]';
import ManageFeedsRoute from '@/app/manage-feeds';
import { AppRoot } from '@/navigation/app-root';
import { MANAGE_WORLDS, type ManageWorldId } from '@/worlds/catalog';
import { FIXTURE_MANAGE, FIXTURE_MANAGE_PINNED } from '@/worlds/fixtures';
import { createWorld, type World, type WorldSpec } from '@/worlds/world';

let world: World | undefined;
async function open(spec: WorldSpec) {
  world = createWorld(spec);
  const w = world;
  await renderRouter(
    {
      _layout: () => <AppRoot environment={w.environment} auth={w.auth} feeds={w.feeds} />,
      '(tabs)/_layout': TabsLayout,
      '(tabs)/index': FeedsRoute,
      '(tabs)/saved': SavedRoute,
      'add-feed': AddFeedRoute,
      'article/[id]': ArticleRoute,
      'manage-feeds': ManageFeedsRoute,
    },
    { initialUrl: w.initialUrl },
  );
  return w;
}
afterEach(() => {
  world?.dispose();
  world = undefined;
});

describe('Manage Feeds worlds', () => {
  type Shows = { feeds: number; pinned: number; handles: number; empty: boolean; theme: 'dark' | 'light'; titleSize: number };
  const SHOWS: Record<ManageWorldId, Shows> = {
    'manage-dark': { feeds: 3, pinned: 1, handles: 1, empty: false, theme: 'dark', titleSize: 24 },
    'manage-light': { feeds: 3, pinned: 1, handles: 1, empty: false, theme: 'light', titleSize: 24 },
    'manage-pinned': { feeds: 4, pinned: 3, handles: 3, empty: false, theme: 'dark', titleSize: 24 },
    'manage-empty': { feeds: 0, pinned: 0, handles: 0, empty: true, theme: 'dark', titleSize: 24 },
    'manage-loading': { feeds: 0, pinned: 0, handles: 0, empty: false, theme: 'dark', titleSize: 24 },
    'manage-largest-font': { feeds: 4, pinned: 3, handles: 3, empty: false, theme: 'dark', titleSize: 48 },
  };

  test.each(MANAGE_WORLDS)('$label', async ({ id, spec }) => {
    const shows = SHOWS[id];
    await open(spec);
    expect(await screen.findByRole('heading', { name: 'Manage Feeds' })).toHaveStyle({ fontSize: shows.titleSize });
    expect(screen.queryAllByRole('button', { name: /^Rename / })).toHaveLength(shows.feeds);
    expect(screen.queryAllByRole('button', { name: /^Unpin / })).toHaveLength(shows.pinned);
    expect(screen.queryAllByLabelText(/^Drag to reorder /)).toHaveLength(shows.handles);
    if (shows.empty) expect(screen.getByText('No Feeds yet. Add one from the + on Feeds.')).toBeOnTheScreen();
    expect(Uniwind.currentTheme).toBe(shows.theme);
  });
});

describe('Manage Feeds', () => {
  test('opens from the Feeds top bar', async () => {
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', feeds: 'some' });
    await user.press(await screen.findByRole('button', { name: 'Manage Feeds' }));
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

  test('renaming a Feed saves the new name', async () => {
    const user = userEvent.setup();
    const w = await open({ colorScheme: 'dark', section: 'manage' });
    await user.press(await screen.findByRole('button', { name: 'Rename Calm Notes' }));
    const field = screen.getByLabelText('New name for Calm Notes');
    await user.clear(field);
    await user.type(field, 'Calm');
    await user.press(screen.getByRole('button', { name: 'Save name' }));
    expect(w.feedsLog.renames).toEqual([{ id: 'f2', title: 'Calm' }]);
  });

  test('removing a Feed asks first, saying Saved Articles stay (T23), then removes it', async () => {
    const alert = jest.spyOn(Alert, 'alert');
    const user = userEvent.setup();
    const w = await open({ colorScheme: 'dark', section: 'manage' });
    await user.press(await screen.findByRole('button', { name: 'Remove Calm Notes' }));
    expect(w.feedsLog.removed).toEqual([]);
    const [title, message, buttons] = alert.mock.calls[0];
    expect(title).toBe('Remove Calm Notes?');
    expect(message).toBe('Its Articles go too. Articles you’ve Saved stay in Saved.');
    const remove = buttons!.find((b) => b.text === 'Remove')!;
    expect(remove.style).toBe('destructive');
    await act(async () => remove.onPress!());
    expect(w.feedsLog.removed).toEqual(['f2']);
    alert.mockRestore();
  });

  test('Pin and Unpin; a fourth Pin is refused, saying why', async () => {
    const toast = jest.spyOn(ToastAndroid, 'show').mockImplementation(() => {});
    const user = userEvent.setup();
    const w = await open({ colorScheme: 'dark', section: 'manage' });
    await user.press(await screen.findByRole('button', { name: 'Pin Calm Notes' }));
    await user.press(screen.getByRole('button', { name: 'Unpin The Verge' }));
    expect(w.feedsLog.pins).toEqual([
      { id: 'f2', pinned: true },
      { id: 'f1', pinned: false },
    ]);
    world!.dispose();
    await open({ colorScheme: 'dark', section: 'manage', manage: 'pinned', pins: 'full' });
    await user.press(await screen.findByRole('button', { name: 'Pin Daring Fireball' }));
    expect(toast).toHaveBeenLastCalledWith('You can Pin up to 3 Feeds. Unpin one first.', ToastAndroid.SHORT);
    toast.mockRestore();
  });

  test('TalkBack orders the Pinned Feeds with Move up and Move down (Q15)', async () => {
    const w = await open({ colorScheme: 'dark', section: 'manage', manage: 'pinned' });
    const [first, second, third] = FIXTURE_MANAGE_PINNED;
    const middle = await screen.findByLabelText(`${second.title}, Pinned, 2 of 3`);
    expect(middle.props.accessibilityActions).toEqual([
      { name: 'moveUp', label: 'Move up' },
      { name: 'moveDown', label: 'Move down' },
    ]);
    await act(async () => fireEvent(middle, 'accessibilityAction', { nativeEvent: { actionName: 'moveUp' } }));
    expect(w.feedsLog.pinOrders).toEqual([[second.id, first.id, third.id]]);
    const top = screen.getByLabelText(`${first.title}, Pinned, 1 of 3`);
    expect(top.props.accessibilityActions).toEqual([{ name: 'moveDown', label: 'Move down' }]);
  });

  test("dragging a Pinned Feed's handle reorders it", async () => {
    const w = await open({ colorScheme: 'dark', section: 'manage', manage: 'pinned' });
    const [first, second, third] = FIXTURE_MANAGE_PINNED;
    // The drag adapter reports where a row was dropped; the screen turns that into the new order.
    const handle = await screen.findByLabelText(`Drag to reorder ${third.title}`);
    await act(async () => handle.props.onDrop(0));
    expect(w.feedsLog.pinOrders).toEqual([[third.id, first.id, second.id]]);
  });

  test('every Feed in the list is there, by name', async () => {
    await open({ colorScheme: 'dark', section: 'manage' });
    for (const feed of FIXTURE_MANAGE) expect(await screen.findByText(feed.title)).toBeOnTheScreen();
  });
});
