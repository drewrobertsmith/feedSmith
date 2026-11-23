import { act, fireEvent, userEvent, waitFor, within } from '@testing-library/react-native';
import { screen } from 'expo-router/testing-library';
import { Uniwind } from 'uniwind';

import { SAVED_WORLDS, type SavedWorldId } from '@/worlds/catalog';
import { FIXTURE_SAVED_ROWS } from '@/worlds/fixtures';
import { createWorld, type World, type WorldSpec } from '@/worlds/world';
import { layOutList, renderWorld } from '../../../test/world-router';

let world: World | undefined;
const open = async (spec: WorldSpec) => {
  world = createWorld(spec);
  await renderWorld(world);
  await layOutList('saved-list');
  return world;
};
afterEach(() => {
  world?.dispose();
  world = undefined;
});

const EMPTY = 'Nothing Saved yet.';
/** Which fixture each row is, in order, by the title its label starts with. */
const titles = () =>
  screen
    .queryAllByRole('link')
    .map((row) => FIXTURE_SAVED_ROWS.find((saved) => row.props.accessibilityLabel.startsWith(saved.title))?.title);

describe('Saved (FEE-30)', () => {
  type Shows = { rows: number; empty: boolean; theme: 'dark' | 'light'; titleSize: number };
  const ROWS = FIXTURE_SAVED_ROWS.length;
  const SHOWS: Record<SavedWorldId, Shows> = {
    'saved-dark': { rows: ROWS, empty: false, theme: 'dark', titleSize: 24 },
    'saved-light': { rows: ROWS, empty: false, theme: 'light', titleSize: 24 },
    'saved-empty': { rows: 0, empty: true, theme: 'dark', titleSize: 24 },
    'saved-empty-light': { rows: 0, empty: true, theme: 'light', titleSize: 24 },
    'saved-loading': { rows: 0, empty: false, theme: 'dark', titleSize: 24 },
    'saved-largest-font': { rows: ROWS, empty: false, theme: 'dark', titleSize: 48 },
    'saved-remove-animations': { rows: ROWS, empty: false, theme: 'dark', titleSize: 24 },
  };

  test.each(SAVED_WORLDS)('$label', async ({ id, spec }) => {
    const shows = SHOWS[id];
    await open(spec);
    expect(await screen.findByRole('heading', { name: 'Saved' })).toHaveStyle({ fontSize: shows.titleSize });
    expect(screen.queryAllByRole('link')).toHaveLength(shows.rows);
    // Never a dead end (Q34): the empty state says how to Save, and leads to Feeds.
    expect(screen.queryAllByText(EMPTY)).toHaveLength(shows.empty ? 1 : 0);
    expect(screen.queryAllByRole('button', { name: 'Go to Feeds' })).toHaveLength(shows.empty ? 1 : 0);
    expect(Uniwind.currentTheme).toBe(shows.theme);
  });

  test('lists Saved Articles most recently Saved first, in the same rows as Feeds', async () => {
    await open({ colorScheme: 'dark', section: 'saved', feeds: 'some' });
    await screen.findByRole('heading', { name: 'Saved' });
    expect(titles()).toEqual(FIXTURE_SAVED_ROWS.map((row) => row.title));
    // Every row here is Saved, so none repeats the Gold mark (Q30: no colour without meaning).
    expect(screen.queryAllByTestId('row-saved-mark')).toHaveLength(0);
  });

  test("an Article whose Feed was removed keeps its Feed's name (T23)", async () => {
    await open({ colorScheme: 'dark', section: 'saved', feeds: 'some' });
    const row = await screen.findByRole('link', { name: /^What the long winter/ });
    expect(row).toHaveAccessibleName(/Morning Brief/);
  });

  test('the top bar is the same as Feeds: the title, then the account circle (Q31)', async () => {
    await open({ colorScheme: 'dark', section: 'saved', feeds: 'some' });
    const bar = await screen.findByTestId('top-bar-Saved');
    expect(within(bar).getAllByRole('button').map((button) => button.props.accessibilityLabel)).toEqual(['Account, Ada Lovelace']);
  });

  test('the empty state leads to Feeds (Q34)', async () => {
    await open({ colorScheme: 'dark', section: 'saved', feeds: 'some', saved: 'none' });
    await userEvent.press(await screen.findByRole('button', { name: 'Go to Feeds' }));
    expect(await screen.findByRole('heading', { name: 'Feeds' })).toBeOnTheScreen();
  });

  test('tapping a row opens its Reading view', async () => {
    await open({ colorScheme: 'dark', section: 'saved', feeds: 'some' });
    await userEvent.press(await screen.findByRole('link', { name: new RegExp(`^${FIXTURE_SAVED_ROWS[0].title.slice(0, 20)}`) }));
    expect(screen).toHavePathname(`/article/${FIXTURE_SAVED_ROWS[0].id}`);
  });

  describe('Done, without the swipe (Q15, Q35)', () => {
    test('every row offers Done to TalkBack, and nothing else to Save', async () => {
      await open({ colorScheme: 'dark', section: 'saved', feeds: 'some' });
      await screen.findByRole('heading', { name: 'Saved' });
      for (const row of screen.getAllByRole('link')) {
        expect(row.props.accessibilityActions).toEqual([{ name: 'done', label: 'Done' }]);
      }
    });

    test('Done takes it out of Saved at once, says so, and Undo puts it back in its place', async () => {
      const w = await open({ colorScheme: 'dark', section: 'saved', feeds: 'some' });
      const [first] = FIXTURE_SAVED_ROWS;
      const row = await screen.findByRole('link', { name: new RegExp(`^${first.title.slice(0, 20)}`) });
      await act(async () => fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'done' } }));

      expect(w.feedsLog.dones).toEqual([first.id]);
      expect(titles()).toEqual(FIXTURE_SAVED_ROWS.slice(1).map((r) => r.title));
      const toast = await screen.findByTestId('undo-toast');
      expect(within(toast).getByText('Marked Done.')).toBeOnTheScreen();

      await userEvent.press(within(toast).getByRole('button', { name: 'Undo' }));
      // Undo puts back what the server found, once it has answered.
      await waitFor(() => expect(w.feedsLog.restores).toHaveLength(1));
      await layOutList('saved-list');
      expect(titles()).toEqual(FIXTURE_SAVED_ROWS.map((r) => r.title));
      expect(screen.queryByTestId('undo-toast')).not.toBeOnTheScreen();
    });
  });
});
