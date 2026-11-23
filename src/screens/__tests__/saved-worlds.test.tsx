import { act, fireEvent, userEvent, waitFor, within } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { screen } from 'expo-router/testing-library';
import { State, type LegacyPanGesture } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { Dimensions } from 'react-native';
import { Uniwind } from 'uniwind';

import { depthStyle } from '@/theme/depth';
import { SAVED_WORLDS, type SavedWorldId } from '@/worlds/catalog';
import { FIXTURE_SAVED_ROWS } from '@/worlds/fixtures';
import { createWorld, type World, type WorldSpec } from '@/worlds/world';
import { layOutList, renderWorld } from '../../../test/world-router';

jest.mock('expo-haptics', () => ({
  ...jest.requireActual('expo-haptics'),
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
}));

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

describe('swiping a row left (FEE-30)', () => {
  const swipe = async (id: string, translationX: number, velocityX = 0) => {
    const gesture = getByGestureTestId(`swipe-${id}`);
    await act(async () =>
      fireGestureHandler<LegacyPanGesture>(gesture, [
        { state: State.BEGAN, translationX: 0 },
        { state: State.ACTIVE, translationX: -20 },
        { translationX },
        { state: State.END, translationX, velocityX },
      ]),
    );
  };

  // Reanimated's animations run on Jest's fake timers (T31): the slide away, the spring home.
  beforeEach(() => {
    jest.useFakeTimers();
    jest.mocked(Haptics.performAndroidHapticsAsync).mockClear();
  });
  afterEach(() => jest.useRealTimers());
  const settle = () => act(async () => jest.advanceTimersByTime(1000));

  test('past the commit point marks it Done, with one tick as it crosses (Q3, Q18)', async () => {
    const w = await open({ colorScheme: 'dark', section: 'saved', feeds: 'some' });
    await screen.findByRole('heading', { name: 'Saved' });
    const [first] = FIXTURE_SAVED_ROWS;
    await swipe(first.id, -0.6 * Dimensions.get('window').width);
    await settle();

    expect(w.feedsLog.dones).toEqual([first.id]);
    expect(jest.mocked(Haptics.performAndroidHapticsAsync).mock.calls).toEqual([[Haptics.AndroidHaptics.Segment_Tick]]);
    expect(within(await screen.findByTestId('undo-toast')).getByText('Marked Done.')).toBeOnTheScreen();
  });

  test('let go early, it snaps back and nothing happens', async () => {
    const w = await open({ colorScheme: 'dark', section: 'saved', feeds: 'some' });
    await screen.findByRole('heading', { name: 'Saved' });
    await swipe(FIXTURE_SAVED_ROWS[0].id, -60);
    await settle();
    expect(w.feedsLog.dones).toEqual([]);
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
    expect(screen.queryByTestId('undo-toast')).not.toBeOnTheScreen();
  });

  test('a quick flick is enough', async () => {
    const w = await open({ colorScheme: 'dark', section: 'saved', feeds: 'some' });
    await screen.findByRole('heading', { name: 'Saved' });
    await swipe(FIXTURE_SAVED_ROWS[1].id, -70, -1800);
    await settle();
    expect(w.feedsLog.dones).toEqual([FIXTURE_SAVED_ROWS[1].id]);
  });

  test("a Done that doesn't go through brings the row back, never leaves it off the screen", async () => {
    const w = await open({ colorScheme: 'dark', section: 'saved', feeds: 'some', savedWrites: 'fail' });
    await screen.findByRole('heading', { name: 'Saved' });
    const [first] = FIXTURE_SAVED_ROWS;
    await swipe(first.id, -0.6 * Dimensions.get('window').width);
    // It slides away, waits for the change, then springs home.
    await settle();
    await settle();
    await settle();
    expect(w.feedsLog.dones).toEqual([]);
    expect(screen.getByTestId(`swipe-row-${first.id}`)).toHaveAnimatedStyle({ transform: [{ translateX: 0 }] });
  });

  test('the panel behind says what letting go will do', async () => {
    await open({ colorScheme: 'dark', section: 'saved', feeds: 'some' });
    await screen.findByRole('heading', { name: 'Saved' });
    expect(screen.getAllByTestId('swipe-panel-done', { includeHiddenElements: true }).length).toBe(FIXTURE_SAVED_ROWS.length);
  });
});

test("the Undo note's timer, and a swiped row's, go with the screen (Q20)", async () => {
  jest.useFakeTimers();
  try {
    await open({ colorScheme: 'dark', section: 'saved', feeds: 'some', savedWrites: 'fail' });
    await screen.findByRole('heading', { name: 'Saved' });
    await act(async () => jest.advanceTimersByTime(300));
    // The timers this change starts: the note's four seconds, and a slid-away row's wait to come back.
    const ours = new Set<ReturnType<typeof setTimeout>>();
    const set = jest.spyOn(globalThis, 'setTimeout');
    const cleared = jest.spyOn(globalThis, 'clearTimeout');
    const [first] = FIXTURE_SAVED_ROWS;
    const row = screen.getByRole('link', { name: new RegExp(`^${first.title.slice(0, 20)}`) });
    await act(async () => fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'done' } }));
    await act(async () =>
      fireGestureHandler<LegacyPanGesture>(getByGestureTestId(`swipe-${FIXTURE_SAVED_ROWS[1].id}`), [
        { state: State.BEGAN, translationX: 0 },
        { state: State.ACTIVE, translationX: -20 },
        { translationX: -0.6 * Dimensions.get('window').width },
        { state: State.END, translationX: -0.6 * Dimensions.get('window').width, velocityX: 0 },
      ]),
    );
    // The row has slid away and is waiting to come back; the note is counting down.
    await act(async () => jest.advanceTimersByTime(300));
    expect(screen.getByTestId('undo-toast')).toBeOnTheScreen();
    set.mock.calls.forEach(([, delay], i) => {
      if (delay === 4000 || delay === 600) ours.add(set.mock.results[i].value);
    });
    // Two notes (the swipe's replaced the first) and the row's wait.
    expect(ours.size).toBeGreaterThanOrEqual(2);
    await act(async () => screen.unmount());
    const clearedIds = new Set(cleared.mock.calls.map(([id]) => id));
    expect([...ours].filter((id) => !clearedIds.has(id))).toEqual([]);
    set.mockRestore();
    cleared.mockRestore();
  } finally {
    jest.useRealTimers();
  }
});

describe('controls have depth, not outlines (FEE-75, D27)', () => {
  const markDone = async () => {
    const row = await screen.findByRole('link', { name: new RegExp(`^${FIXTURE_SAVED_ROWS[0].title.slice(0, 20)}`) });
    await act(async () => fireEvent(row, 'accessibilityAction', { nativeEvent: { actionName: 'done' } }));
    return screen.findByTestId('undo-toast');
  };

  test.each(['dark', 'light'] as const)('in %s, Go to Feeds is soft, sinks when pressed, and has no outline', async (colorScheme) => {
    await open({ colorScheme, section: 'saved', feeds: 'some', saved: 'none' });
    const button = await screen.findByRole('button', { name: 'Go to Feeds' });
    expect(button).toHaveStyle(depthStyle(colorScheme, 'soft'));
    expect(button).not.toHaveStyle({ borderWidth: expect.any(Number) });
    await fireEvent(button, 'pressIn');
    expect(screen.getByRole('button', { name: 'Go to Feeds' })).toHaveStyle(depthStyle(colorScheme, 'pressed'));
  });

  test.each(['dark', 'light'] as const)('in %s, the Undo note rests raised over the list, with a soft Undo on it', async (colorScheme) => {
    await open({ colorScheme, section: 'saved', feeds: 'some' });
    const toast = await markDone();
    expect(toast).toHaveStyle(depthStyle(colorScheme, 'raised'));
    expect(within(toast).getByRole('button', { name: 'Undo' })).toHaveStyle(depthStyle(colorScheme, 'soft'));
  });

  // A gradient face inside a Reanimated entering animation never showed when Reanimated skipped motion itself (FEE-74).
  test.each([
    [false, 1],
    [true, 0],
  ])('with Remove animations %s, the Undo note has %i animations of its own (Q17)', async (reduceMotion, count) => {
    await open({ colorScheme: 'dark', section: 'saved', feeds: 'some', reduceMotion });
    const toast = await markDone();
    expect([toast.props.entering, toast.props.exiting].filter(Boolean).length).toBe(count * 2);
  });
});
