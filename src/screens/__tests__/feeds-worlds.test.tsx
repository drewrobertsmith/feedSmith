import { faceOf } from '../../../test/depth';
import { act, fireEvent, userEvent, waitFor, within } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { screen } from 'expo-router/testing-library';
import { useState } from 'react';
import { Animated, Dimensions, ScrollView, ToastAndroid } from 'react-native';
import { State, type LegacyPanGesture } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { getAnimatedStyle as untypedGetAnimatedStyle } from 'react-native-reanimated';
import type { getAnimatedStyle as GetAnimatedStyle } from 'react-native-reanimated/lib/typescript/jestUtils/index.native';
import * as WebBrowser from 'expo-web-browser';
import { Uniwind } from 'uniwind';

import { publishedAgo, publishedDate } from '@/feeds/format';
import { depthStyle } from '@/theme/depth';
import { spacing } from '@/theme/spacing';
import { themes } from '@/theme/tokens';
import {
  ADD_FEED_WORLDS,
  ALL_WORLDS,
  PINNED_GROUP_WORLDS,
  PINNED_STACK_WORLDS,
  PINNED_WORLDS,
  READING_WORLDS,
  type AddFeedWorldId,
  type AllWorldId,
  type PinnedGroupWorldId,
  type PinnedStackWorldId,
  type PinnedWorldId,
  type ReadingWorldId,
} from '@/worlds/catalog';
import {
  FIXTURE_ARTICLE,
  FIXTURE_CHOICES,
  FIXTURE_EXTRACTING_ARTICLE,
  FIXTURE_NOW,
  FIXTURE_ROWS,
  FIXTURE_UNEXTRACTED_ARTICLE,
} from '@/worlds/fixtures';
import type { ArticleView } from '@/feeds/feeds-data';
import { createWorld, type World, type WorldSpec } from '@/worlds/world';
import { layOutList, renderWorld } from '../../../test/world-router';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));
// Reanimated's real one, as its native typings describe it (T31).
const getAnimatedStyle = untypedGetAnimatedStyle as unknown as typeof GetAnimatedStyle;
jest.mock('expo-haptics', () => ({
  ...jest.requireActual('expo-haptics'),
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
}));

let world: World | undefined;
const open = async (spec: WorldSpec, initialUrl?: string) => {
  world = createWorld(spec);
  await renderWorld(world, initialUrl);
  await layOutList('all-list');
  return world;
};
afterEach(() => {
  world?.dispose();
  world = undefined;
  jest.mocked(WebBrowser.openBrowserAsync).mockClear();
});

describe('All', () => {
  type Shows = {
    rows: number;
    read: number;
    empty: boolean;
    refreshing: boolean;
    theme: 'dark' | 'light';
    titleSize: number;
    selected: string;
    /** Rows that name their Feed: none when one Feed is chosen, since its chip names it (FEE-42). */
    feedNames: number;
    /** The line under the Feeds title (FEE-47): when All was last updated, or that it's updating. */
    updated: string | null;
    /** A chosen Feed with nothing new offers Manage this Feed (Q34). */
    manage: boolean;
  };
  const ROWS = FIXTURE_ROWS.length;
  const READ = FIXTURE_ROWS.filter((r) => r.read).length;
  const VERGE_ROWS = FIXTURE_ROWS.filter((r) => r.feedId === 'f1').length;
  const SHOWS: Record<AllWorldId, Shows> = {
    'all-dark': { rows: ROWS, read: READ, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: 'All', feedNames: ROWS, updated: 'Updated 5 min ago', manage: false },
    'all-light': { rows: ROWS, read: READ, empty: false, refreshing: false, theme: 'light', titleSize: 24, selected: 'All', feedNames: ROWS, updated: 'Updated 5 min ago', manage: false },
    'all-read': { rows: ROWS, read: ROWS, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: 'All', feedNames: ROWS, updated: 'Updated 5 min ago', manage: false },
    'all-empty': { rows: 0, read: 0, empty: true, refreshing: false, theme: 'dark', titleSize: 24, selected: '', feedNames: 0, updated: null, manage: false },
    'all-loading': { rows: 0, read: 0, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: '', feedNames: 0, updated: null, manage: false },
    'all-refreshing': { rows: ROWS, read: READ, empty: false, refreshing: true, theme: 'light', titleSize: 24, selected: 'All', feedNames: ROWS, updated: 'Updating…', manage: false },
    'all-largest-font': { rows: ROWS, read: READ, empty: false, refreshing: false, theme: 'dark', titleSize: 48, selected: 'All', feedNames: ROWS, updated: 'Updated 5 min ago', manage: false },
    'all-feed': { rows: VERGE_ROWS, read: 1, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: 'The Verge, Pinned', feedNames: 0, updated: 'Updated 5 min ago', manage: false },
    'all-feed-light': { rows: 1, read: 0, empty: false, refreshing: false, theme: 'light', titleSize: 24, selected: 'Calm Notes', feedNames: 0, updated: 'Updated 5 min ago', manage: false },
    'all-feed-empty': { rows: 0, read: 0, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: 'Daring Fireball', feedNames: 0, updated: 'Updated 5 min ago', manage: true },
    'all-many-feeds': { rows: ROWS, read: READ, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: 'All', feedNames: ROWS, updated: 'Updated 5 min ago', manage: false },
    'all-many-feeds-largest-font': {
      rows: ROWS,
      read: READ,
      empty: false,
      refreshing: false,
      theme: 'light',
      titleSize: 48,
      selected: 'All',
      feedNames: ROWS,
      updated: 'Updated 5 min ago',
      manage: false,
    },
    'all-remove-animations': { rows: ROWS, read: READ, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: 'All', feedNames: ROWS, updated: 'Updated 5 min ago', manage: false },
  };

  test.each(ALL_WORLDS)('$label', async ({ id, spec }) => {
    const shows = SHOWS[id];
    await open(spec);
    expect(await screen.findByRole('heading', { name: 'Feeds' })).toHaveStyle({ fontSize: shows.titleSize });
    expect(screen.queryAllByRole('link')).toHaveLength(shows.rows);
    expect(screen.queryAllByRole('link', { name: /, Read$/ })).toHaveLength(shows.read);
    if (shows.empty) {
      expect(screen.getByText('Add a Feed to see its Articles here.')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Add a Feed' })).toBeEnabled();
    } else {
      expect(screen.queryByText('Add a Feed to see its Articles here.')).not.toBeOnTheScreen();
    }
    if (!shows.empty && shows.rows > 0) {
      expect(screen.getByTestId('all-list').props.refreshControl.props.refreshing).toBe(shows.refreshing);
    }
    if (shows.updated) expect(screen.getByText(shows.updated)).toBeOnTheScreen();
    else expect(screen.queryByText(/^Updat/)).not.toBeOnTheScreen();
    expect(screen.queryAllByRole('button', { name: 'Manage this Feed' })).toHaveLength(shows.manage ? 1 : 0);
    if (shows.selected) expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(shows.selected);
    expect(screen.queryAllByTestId('row-feed-name')).toHaveLength(shows.feedNames);
    expect(Uniwind.currentTheme).toBe(shows.theme);
  });

  test('the chip row: All, the Pinned Feed, then the rest; only Feeds, no + chip (P5, P9, FEE-44)', async () => {
    await open({ colorScheme: 'dark', feeds: 'some' });
    const tabs = await screen.findAllByRole('tab');
    const names = ['All', 'The Verge, Pinned', 'Calm Notes', 'Daring Fireball'];
    expect(tabs).toHaveLength(names.length);
    tabs.forEach((tab, i) => expect(tab).toHaveAccessibleName(names[i]));
    expect(screen.queryByText('+')).not.toBeOnTheScreen();
  });

  test('the top bar: the Feeds title, then Add a Feed, then the account circle; one way to add (Q31, D17)', async () => {
    await open({ colorScheme: 'dark', feeds: 'some' });
    const bar = await screen.findByTestId('top-bar-Feeds');
    expect(within(bar).getByRole('heading', { name: 'Feeds' })).toBeOnTheScreen();
    expect(within(bar).getAllByRole('button').map((button) => button.props.accessibilityLabel)).toEqual([
      'Add a Feed',
      'Account, Ada Lovelace',
    ]);
    expect(screen.getAllByRole('button', { name: 'Add a Feed' })).toHaveLength(1);
  });

  test("a long Feed name is short on its chip, but TalkBack hears all of it (FEE-44)", async () => {
    await open({ colorScheme: 'dark', feeds: 'some', chips: 'many' });
    const chip = await screen.findByRole('tab', { name: 'The Verge - Full RSS for subscribers | The Verge, Pinned' });
    expect(chip).toBeOnTheScreen();
    expect(screen.getByText('The Verge - Full…')).toBeOnTheScreen();
  });

  test('the chosen chip is brought into view once: a scroll or a Feed added later never pulls the row back (FEE-44)', async () => {
    await open({ colorScheme: 'dark', feeds: 'some', chips: 'many' }, '/?feed=f8');
    await screen.findAllByRole('tab');
    const row = screen.getByTestId('chip-row');
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
    const layout = (width: number, x = 0) => ({ nativeEvent: { layout: { x, y: 0, width, height: 48 } } });
    await fireEvent(screen.getByRole('tab', { name: 'Kottke' }).parent!, 'layout', layout(90, 1100));
    await fireEvent(row, 'layout', layout(400));
    await fireEvent(row, 'contentSizeChange', 1200, 48);
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('chip-fade-end')).toBeOnTheScreen();
    scrollTo.mockClear();
    // The person scrolls back to the start, then a Feed is added: the row's size changes, and it stays where it was left.
    await fireEvent(row, 'scrollEndDrag', { nativeEvent: { contentOffset: { x: 0, y: 0 } } });
    await fireEvent(row, 'contentSizeChange', 1300, 48);
    await fireEvent(row, 'layout', layout(420));
    expect(scrollTo).not.toHaveBeenCalled();
    scrollTo.mockRestore();
  });

  test('a chip chosen by a link, past the edge of the row, scrolls into view (FEE-44)', async () => {
    await open({ colorScheme: 'dark', feeds: 'some', chips: 'many' }, '/?feed=f8');
    await screen.findAllByRole('tab');
    const row = screen.getByTestId('chip-row');
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
    const layout = (width: number, x = 0) => ({ nativeEvent: { layout: { x, y: 0, width, height: 48 } } });
    // Kottke, the last chip, sits at 1100 of a 1200-wide row that shows 400.
    await fireEvent(screen.getByRole('tab', { name: 'Kottke' }).parent!, 'layout', layout(90, 1100));
    await fireEvent(row, 'layout', layout(400));
    await fireEvent(row, 'contentSizeChange', 1200, 48);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ x: 1100 - spacing.edge }));
    scrollTo.mockRestore();
  });

  // FEE-74: chips are objects with depth, not outlines (D27). Each is checked as its level from the theme.
  test.each(['dark', 'light'] as const)('in %s, the chosen chip is raised, the rest soft, and none has an outline', async (colorScheme) => {
    await open({ colorScheme, feeds: 'some' });
    await screen.findAllByRole('tab');
    const all = screen.getByRole('tab', { name: 'All' });
    const calm = screen.getByRole('tab', { name: 'Calm Notes' });
    expect(faceOf(all)).toMatchObject(depthStyle(colorScheme, 'raised'));
    expect(faceOf(calm)).toMatchObject(depthStyle(colorScheme, 'soft'));
    for (const chip of [all, calm]) expect(chip).not.toHaveStyle({ borderWidth: expect.any(Number) });
    // Still quieter than the chosen one: muted text, with Gold only on the chosen label (D5).
    expect(within(calm).getByText('Calm Notes')).toHaveProp('className', expect.stringContaining('text-text-muted'));
    expect(within(all).getByText('All')).toHaveProp('className', expect.stringContaining('text-accent'));
  });

  test.each(['dark', 'light'] as const)('in %s, a chip under the finger sinks to the pressed level, and rises again when let go', async (colorScheme) => {
    await open({ colorScheme, feeds: 'some' });
    const calm = (await screen.findAllByRole('tab', { name: 'Calm Notes' }))[0];
    await fireEvent(calm, 'pressIn');
    expect(faceOf(screen.getByRole('tab', { name: 'Calm Notes' }))).toMatchObject(depthStyle(colorScheme, 'pressed'));
    await fireEvent(calm, 'pressOut');
    expect(faceOf(screen.getByRole('tab', { name: 'Calm Notes' }))).toMatchObject(depthStyle(colorScheme, 'soft'));
  });

  test("tapping a Feed's chip shows only its Articles; tapping All shows everything again", async () => {
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', feeds: 'some' });
    await user.press(await screen.findByRole('tab', { name: 'Calm Notes' }));
    await layOutList('all-list');
    expect(screen.getByRole('tab', { name: 'Calm Notes' })).toBeSelected();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    await user.press(screen.getByRole('tab', { name: 'All' }));
    await layOutList('all-list');
    expect(screen.getAllByRole('link')).toHaveLength(FIXTURE_ROWS.length);
  });

  test("a long Feed name stays on one line, so a chip can't run off the screen (Q16)", async () => {
    await open({ colorScheme: 'dark', feeds: 'some', fontScale: 2 });
    await screen.findAllByRole('tab');
    expect(screen.getByText('Daring Fireball')).toHaveProp('numberOfLines', 1);
  });

  test('a Feed with nothing new says so, by name', async () => {
    await open({ colorScheme: 'dark', feeds: 'some', feed: 'f3' });
    expect(await screen.findByText('No Articles from Daring Fireball in the last 30 days.')).toBeOnTheScreen();
  });

  test.each([
    ['not one of yours', '/?feed=someone-elses'],
    ['malformed', '/?feed=%3Cscript%3E'],
    ['oversized', `/?feed=${'a'.repeat(500)}`],
  ])('a link to a Feed that is %s opens All (Q25)', async (_case, url) => {
    await open({ colorScheme: 'dark', feeds: 'some' }, url);
    expect(await screen.findByRole('tab', { selected: true })).toHaveAccessibleName('All');
  });

  describe('Pinning by long-press (P9)', () => {
    test('long-pressing a Feed Pins it, says so, and Undo unpins it (Q35)', async () => {
      const user = userEvent.setup();
      const w = await open({ colorScheme: 'dark', feeds: 'some' });
      await user.longPress(await screen.findByRole('tab', { name: 'Calm Notes' }));
      expect(w.feedsLog.pins).toEqual([{ id: 'f2', pinned: true }]);
      const toast = await screen.findByTestId('undo-toast');
      expect(within(toast).getByText('Pinned Calm Notes.')).toBeOnTheScreen();
      await user.press(within(toast).getByRole('button', { name: 'Undo' }));
      await waitFor(() => expect(w.feedsLog.pins).toEqual([{ id: 'f2', pinned: true }, { id: 'f2', pinned: false }]));
    });

    test('long-pressing a Pinned Feed unpins it, and Undo puts it back in its place (Q35)', async () => {
      const user = userEvent.setup();
      const w = await open({ colorScheme: 'dark', feeds: 'some' });
      await user.longPress(await screen.findByRole('tab', { name: 'The Verge, Pinned' }));
      expect(w.feedsLog.pins).toEqual([{ id: 'f1', pinned: false }]);
      const toast = await screen.findByTestId('undo-toast');
      expect(within(toast).getByText('Unpinned The Verge.')).toBeOnTheScreen();
      await user.press(within(toast).getByRole('button', { name: 'Undo' }));
      await waitFor(() => expect(w.feedsLog.restoredPins).toEqual([{ id: 'f1', place: 0 }]));
    });

    test('a fourth Pin is refused, saying why, with nothing to Undo', async () => {
      const user = userEvent.setup();
      await open({ colorScheme: 'dark', feeds: 'some', pins: 'full' });
      await user.longPress(await screen.findByRole('tab', { name: 'Calm Notes' }));
      const toast = await screen.findByTestId('undo-toast');
      expect(within(toast).getByText('You can Pin up to 3 Feeds. Unpin one first.')).toBeOnTheScreen();
      expect(within(toast).queryByRole('button', { name: 'Undo' })).not.toBeOnTheScreen();
    });

    test('TalkBack can Pin and unpin without a long-press (Q15)', async () => {
      const w = await open({ colorScheme: 'dark', feeds: 'some' });
      const calm = await screen.findByRole('tab', { name: 'Calm Notes' });
      expect(calm.props.accessibilityActions).toEqual([{ name: 'pin', label: 'Pin' }]);
      await act(async () => fireEvent(calm, 'accessibilityAction', { nativeEvent: { actionName: 'pin' } }));
      expect(w.feedsLog.pins).toEqual([{ id: 'f2', pinned: true }]);
      const verge = screen.getByRole('tab', { name: 'The Verge, Pinned' });
      expect(verge.props.accessibilityActions).toEqual([{ name: 'pin', label: 'Unpin' }]);
    });

    test('All has nothing to Pin', async () => {
      const user = userEvent.setup();
      const w = await open({ colorScheme: 'dark', feeds: 'some' });
      await user.longPress(await screen.findByRole('tab', { name: 'All' }));
      expect(w.feedsLog.pins).toEqual([]);
    });
  });

  describe('selecting a chip moves (D7, Q17)', () => {
    let spring: jest.SpyInstance;
    beforeEach(() => {
      spring = jest.spyOn(Animated, 'spring');
    });
    afterEach(() => spring.mockRestore());

    test('with motion on, the chosen chip springs', async () => {
      const user = userEvent.setup();
      await open({ colorScheme: 'dark', feeds: 'some' });
      await user.press(await screen.findByRole('tab', { name: 'Calm Notes' }));
      expect(spring).toHaveBeenCalled();
    });

    test('with Remove animations on, it changes without moving', async () => {
      const user = userEvent.setup();
      await open({ colorScheme: 'dark', feeds: 'some', reduceMotion: true });
      await user.press(await screen.findByRole('tab', { name: 'Calm Notes' }));
      expect(spring).not.toHaveBeenCalled();
      expect(screen.getByRole('tab', { name: 'Calm Notes' })).toBeSelected();
    });
  });

  test('pulling down asks every Feed to refresh, from the server (Q21)', async () => {
    const w = await open({ colorScheme: 'dark', feeds: 'some' });
    const list = await screen.findByTestId('all-list');
    await act(() => list.props.refreshControl.props.onRefresh());
    expect(w.feedsLog.refreshes).toBe(1);
  });

  test('each Article reads its title, Feed, when it was published and Read to TalkBack, newest first (Q15)', async () => {
    await open({ colorScheme: 'dark', feeds: 'some' });
    const rows = await screen.findAllByRole('link');
    const [first, second] = FIXTURE_ROWS;
    expect(rows[0]).toHaveAccessibleName(`${first.title}, By Terrence O’Brien, The Verge, ${publishedAgo(first.publishedAt, FIXTURE_NOW)}`);
    expect(rows[1]).toHaveAccessibleName(
      `${second.title}, By Emma Roth and Jay Peters, The Verge, ${publishedAgo(second.publishedAt, FIXTURE_NOW)}, Saved, Read`,
    );
    const [, , third] = FIXTURE_ROWS;
    expect(rows[2]).toHaveAccessibleName(`${third.title}, The Verge, ${publishedAgo(third.publishedAt, FIXTURE_NOW)}, Saved`);
  });

  test("a row credits its authors under the title, above the Subtitle; a row with none has no byline (FEE-41)", async () => {
    await open({ colorScheme: 'dark', feeds: 'some' });
    await screen.findAllByRole('link');
    const [first] = FIXTURE_ROWS;
    const order = screen.getAllByText(/.+/).map((node) => node.props.children).filter((text) => typeof text === 'string');
    expect(order.indexOf(first.title)).toBeLessThan(order.indexOf('By Terrence O’Brien'));
    expect(order.indexOf('By Terrence O’Brien')).toBeLessThan(order.indexOf(first.subtitle!));
    expect(screen.getByText('By Emma Roth and Jay Peters')).toHaveProp('numberOfLines', 1);
    expect(screen.getAllByText(/^By /)).toHaveLength(2);
  });

  test('a row shows its Subtitle and lead image when it has them, and leaves them out when not (P12)', async () => {
    await open({ colorScheme: 'dark', feeds: 'some' });
    await screen.findAllByRole('link');
    expect(screen.getByText(FIXTURE_ROWS[0].subtitle!)).toBeOnTheScreen();
    expect(screen.getByText(FIXTURE_ROWS[1].subtitle!)).toBeOnTheScreen();
    // Rows 1 and 3 have lead images; 2 and 4 don't.
    expect(screen.getAllByTestId('row-image')).toHaveLength(2);
    // A Feed without a favicon shows its initial instead.
    expect(screen.getAllByTestId('row-favicon')).toHaveLength(3);
    expect(screen.getByText('C')).toBeOnTheScreen();
  });

  test.each([
    ["a tiny icon (a placeholder, or blurry at row size) gives way to the Feed's initial", 16, true],
    ['a real icon stays', 32, false],
  ])('%s (D14)', async (_case, width, initial) => {
    await open({ colorScheme: 'dark', feeds: 'some' });
    await screen.findAllByRole('link');
    const [icon] = screen.getAllByTestId('row-favicon');
    await act(async () => fireEvent(icon, 'load', { nativeEvent: { source: { width, height: width } } }));
    expect(screen.queryAllByTestId('row-favicon')).toHaveLength(initial ? 2 : 3);
    if (initial) expect(screen.getByText('T')).toBeOnTheScreen();
    else expect(screen.queryByText('T')).not.toBeOnTheScreen();
  });

  test("an icon that won't load shows the Feed's initial", async () => {
    await open({ colorScheme: 'dark', feeds: 'some' });
    await screen.findAllByRole('link');
    await act(async () => fireEvent(screen.getAllByTestId('row-favicon')[0], 'error', { nativeEvent: { error: 'failed' } }));
    expect(screen.getByText('T')).toBeOnTheScreen();
  });

  test("a row's meta, byline and Subtitle are three voices: muted sans, full sans, muted Literata (Q29, FEE-42)", async () => {
    await open({ colorScheme: 'dark', feeds: 'some' });
    await screen.findAllByRole('link');
    const [first] = FIXTURE_ROWS;
    expect(screen.getAllByTestId('row-feed-name')[0]).toHaveStyle({ fontFamily: 'InstrumentSans' });
    expect(screen.getAllByTestId('row-feed-name')[0]).toHaveProp('className', expect.stringContaining('text-text-muted'));
    expect(screen.getByText(first.title)).toHaveStyle({ fontFamily: 'Literata' });
    const credit = screen.getByText('By Terrence O’Brien');
    expect(credit).toHaveStyle({ fontFamily: 'InstrumentSans' });
    expect(credit).not.toHaveProp('className', expect.stringContaining('text-text-muted'));
    const summary = screen.getByText(first.subtitle!);
    expect(summary).toHaveStyle({ fontFamily: 'Literata', fontSize: 15 });
    expect(summary).toHaveProp('className', expect.stringContaining('text-text-muted'));
  });

  test("with one Feed chosen, rows don't repeat its name, to the eye or to TalkBack (FEE-42)", async () => {
    await open({ colorScheme: 'dark', feeds: 'some', feed: 'f1' });
    const [first] = FIXTURE_ROWS;
    const row = (await screen.findAllByRole('link'))[0];
    expect(row).toHaveAccessibleName(`${first.title}, By Terrence O’Brien, ${publishedAgo(first.publishedAt, FIXTURE_NOW)}`);
    expect(screen.getAllByTestId('row-favicon').length).toBeGreaterThan(0);
  });

  test('switching chips tells the rows which way to slide (FEE-42)', async () => {
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', feeds: 'some' });
    await screen.findAllByRole('link');
    expect(screen.getByTestId('chip-switch')).toHaveProp('index', 0);
    await user.press(screen.getByRole('tab', { name: 'Calm Notes' }));
    expect(screen.getByTestId('chip-switch')).toHaveProp('index', 2);
  });

  test('a Subtitle is two lines at most', async () => {
    await open({ colorScheme: 'dark', feeds: 'some' });
    expect(await screen.findByText(FIXTURE_ROWS[0].subtitle!)).toHaveProp('numberOfLines', 2);
  });

  test('Read rows are dimmed, never hidden, and nothing counts them (P7)', async () => {
    await open({ colorScheme: 'dark', feeds: 'some' });
    await screen.findAllByRole('link');
    expect(screen.getByText(FIXTURE_ROWS[1].title)).toHaveProp('className', expect.stringContaining('text-text-muted'));
    expect(screen.getByText(FIXTURE_ROWS[0].title)).not.toHaveProp('className', expect.stringContaining('text-text-muted'));
    expect(screen.queryByText(/unread|\b\d+ new\b/i)).not.toBeOnTheScreen();
  });

  test('tapping an Article opens its Reading view', async () => {
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', feeds: 'some' });
    await user.press(await screen.findByRole('link', { name: new RegExp(FIXTURE_ROWS[0].title) }));
    expect(await screen.findByRole('heading', { name: FIXTURE_ARTICLE.title })).toBeOnTheScreen();
  });

  test.each([
    ['the empty state', 'none'],
    ['the top bar', 'some'],
  ] as const)('Add a Feed in %s opens the Add Feed screen', async (_where, feeds) => {
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', feeds });
    await user.press(await screen.findByRole('button', { name: 'Add a Feed' }));
    expect(await screen.findByRole('heading', { name: 'Add a Feed' })).toBeOnTheScreen();
  });

  describe('swiping a row left in Feeds (FEE-30)', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.mocked(Haptics.performAndroidHapticsAsync).mockClear();
    });
    afterEach(() => jest.useRealTimers());
    const width = () => Dimensions.get('window').width;
    const swipe = async (id: string, translationX: number) =>
      act(async () =>
        fireGestureHandler<LegacyPanGesture>(getByGestureTestId(`swipe-${id}`), [
          { state: State.BEGAN, translationX: 0 },
          { state: State.ACTIVE, translationX: -20 },
          { translationX },
          { state: State.END, translationX, velocityX: 0 },
        ]),
      );
    const translateX = (id: string) => {
      const style = getAnimatedStyle(screen.getByTestId(`swipe-row-${id}`)) as { transform?: { translateX: number }[] };
      return style.transform?.[0]?.translateX ?? 0;
    };

    test('Saves it; the row springs back and stays, now marked in Gold, with Undo', async () => {
      const w = await open({ colorScheme: 'dark', feeds: 'some' });
      const [first] = FIXTURE_ROWS;
      await screen.findByRole('heading', { name: 'Feeds' });
      await swipe(first.id, -0.6 * width());
      await act(async () => jest.advanceTimersByTime(1000));

      expect(w.feedsLog.saves).toEqual([first.id]);
      expect(jest.mocked(Haptics.performAndroidHapticsAsync).mock.calls).toEqual([[Haptics.AndroidHaptics.Segment_Tick]]);
      expect(translateX(first.id)).toBe(0);
      expect(screen.getByRole('link', { name: new RegExp(`^${first.title.slice(0, 20)}.*, Saved$`) })).toBeOnTheScreen();
      expect(screen.getByTestId('undo-toast')).toBeOnTheScreen();
      // The panel behind it said Save, in Gold.
      expect(screen.getAllByTestId('swipe-panel-save', { includeHiddenElements: true }).length).toBeGreaterThan(0);
    });

    test('a Saved row swiped marks it Done, and stays in Feeds as Read (P21)', async () => {
      const w = await open({ colorScheme: 'dark', feeds: 'some' });
      const saved = FIXTURE_ROWS[2];
      await screen.findByRole('heading', { name: 'Feeds' });
      expect(screen.getAllByTestId('swipe-panel-done', { includeHiddenElements: true }).length).toBeGreaterThan(0);
      await swipe(saved.id, -0.6 * width());
      await act(async () => jest.advanceTimersByTime(1000));
      expect(w.feedsLog.dones).toEqual([saved.id]);
      expect(screen.getByRole('link', { name: new RegExp(`^${saved.title.slice(0, 20)}.*, Read$`) })).not.toHaveAccessibleName(/Saved/);
    });

    test.each([
      ['springs home', false, true],
      ['is home at once with Remove animations (Q17)', true, false],
    ])('let go early, the row %s', async (_name, reduceMotion, moving) => {
      await open({ colorScheme: 'dark', feeds: 'some', reduceMotion });
      const [first] = FIXTURE_ROWS;
      await screen.findByRole('heading', { name: 'Feeds' });
      await swipe(first.id, -0.2 * width());
      await act(async () => jest.advanceTimersByTime(16));
      expect(translateX(first.id) !== 0).toBe(moving);
      await act(async () => jest.advanceTimersByTime(1000));
      expect(translateX(first.id)).toBe(0);
    });
  });

  describe('Save and Done from a row (FEE-30)', () => {
    const row = (title: string) => screen.findByRole('link', { name: new RegExp(`^${title.slice(0, 20)}`) });

    test('a Saved Article is marked in Gold, to the eye and to TalkBack (D5)', async () => {
      await open({ colorScheme: 'dark', feeds: 'some' });
      await screen.findByRole('heading', { name: 'Feeds' });
      const saved = FIXTURE_ROWS.filter((r) => r.saved);
      expect(screen.getAllByTestId('row-saved-mark')).toHaveLength(saved.length);
      expect(screen.getAllByRole('link', { name: /, Saved(, Read)?$/ })).toHaveLength(saved.length);
      for (const mark of screen.getAllByTestId('row-saved-mark')) expect(mark.props.tintColor).toBe(themes.dark.accent);
    });

    test('a row offers Save to TalkBack, or Done once Saved (Q15)', async () => {
      await open({ colorScheme: 'dark', feeds: 'some' });
      expect((await row(FIXTURE_ROWS[0].title)).props.accessibilityActions).toEqual([{ name: 'save', label: 'Save' }]);
      expect((await row(FIXTURE_ROWS[2].title)).props.accessibilityActions).toEqual([{ name: 'done', label: 'Done' }]);
    });

    test('Save marks it at once, with a haptic, says so, and Undo takes it back (Q3, Q35)', async () => {
      const w = await open({ colorScheme: 'dark', feeds: 'some' });
      const [first] = FIXTURE_ROWS;
      await act(async () => fireEvent(await row(first.title), 'accessibilityAction', { nativeEvent: { actionName: 'save' } }));

      expect(w.feedsLog.saves).toEqual([first.id]);
      expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith(Haptics.AndroidHaptics.Confirm);
      expect(await row(first.title)).toHaveAccessibleName(/, Saved$/);
      const toast = await screen.findByTestId('undo-toast');
      expect(within(toast).getByText('Saved.')).toBeOnTheScreen();

      await userEvent.press(within(toast).getByRole('button', { name: 'Undo' }));
      await waitFor(() => expect(w.feedsLog.restores).toEqual([{ id: first.id, before: {} }]));
      expect(await row(first.title)).not.toHaveAccessibleName(/Saved/);
    });

    test('Done on a Saved row takes it out of Saved and leaves it Read (P8)', async () => {
      const w = await open({ colorScheme: 'dark', feeds: 'some' });
      const saved = FIXTURE_ROWS[2];
      await act(async () => fireEvent(await row(saved.title), 'accessibilityAction', { nativeEvent: { actionName: 'done' } }));
      expect(w.feedsLog.dones).toEqual([saved.id]);
      expect(await row(saved.title)).toHaveAccessibleName(/, Read$/);
      expect(await row(saved.title)).not.toHaveAccessibleName(/Saved/);
      expect(within(await screen.findByTestId('undo-toast')).getByText('Marked Done.')).toBeOnTheScreen();
    });

    test("a Save that doesn't reach the server offers no Undo to do", async () => {
      const w = await open({ colorScheme: 'dark', feeds: 'some', savedWrites: 'fail' });
      await act(async () => fireEvent(await row(FIXTURE_ROWS[0].title), 'accessibilityAction', { nativeEvent: { actionName: 'save' } }));
      await userEvent.press(within(await screen.findByTestId('undo-toast')).getByRole('button', { name: 'Undo' }));
      expect(w.feedsLog.restores).toEqual([]);
    });
  });
});

describe('the Pinned view (FEE-59)', () => {
  type Shows = {
    /** The chips in order, by TalkBack name. */
    chips: string[];
    /** The chosen chip's TalkBack name. */
    selected: string;
    /** The rows' Feeds, in order. */
    rows: string[];
    empty: boolean;
  };
  const PINNED_CHIP = 'Pinned: The Verge, Daring Fireball';
  const TWO_PIN_CHIPS = ['All', PINNED_CHIP, 'The Verge, Pinned', 'Daring Fireball, Pinned', 'Calm Notes'];
  const FOLDED_CHIPS = ['All', PINNED_CHIP, 'Calm Notes'];
  const ALL_ROWS = FIXTURE_ROWS.map((row) => row.feedTitle);
  // The Verge's Articles, and not Calm Notes': Pinned is narrower than All.
  const PINNED_ROWS = FIXTURE_ROWS.filter((row) => row.feedId === 'f1').map((row) => row.feedTitle);
  const SHOWS: Record<PinnedWorldId, Shows> = {
    'pinned-dark': { chips: TWO_PIN_CHIPS, selected: PINNED_CHIP, rows: PINNED_ROWS, empty: false },
    'pinned-light': { chips: TWO_PIN_CHIPS, selected: PINNED_CHIP, rows: PINNED_ROWS, empty: false },
    'pinned-empty': {
      chips: ['All', 'Pinned: Daring Fireball, Kottke', 'Daring Fireball, Pinned', 'Kottke, Pinned', 'The Verge', 'Calm Notes'],
      selected: 'Pinned: Daring Fireball, Kottke',
      rows: [],
      empty: true,
    },
    // All chosen: the group folds into the Pinned chip (FEE-60).
    'pinned-all': { chips: FOLDED_CHIPS, selected: 'All', rows: ALL_ROWS, empty: false },
    // One Pin makes no Pinned chip, so a link to Pinned lands on All (Q25).
    'pinned-one-pin': { chips: ['All', 'The Verge, Pinned', 'Calm Notes', 'Daring Fireball'], selected: 'All', rows: ALL_ROWS, empty: false },
    'pinned-hostile-link': { chips: FOLDED_CHIPS, selected: 'All', rows: ALL_ROWS, empty: false },
    'pinned-largest-font': { chips: TWO_PIN_CHIPS, selected: PINNED_CHIP, rows: PINNED_ROWS, empty: false },
  };

  test.each(PINNED_WORLDS)('$label', async ({ id, spec }) => {
    const shows = SHOWS[id];
    await open(spec);
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.props.accessibilityLabel)).toEqual(shows.chips);
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(shows.selected);
    const rows = screen.queryAllByRole('link').filter((row) => /ago|yesterday/.test(row.props.accessibilityLabel));
    expect(rows).toHaveLength(shows.rows.length);
    expect(screen.queryAllByText('No Articles from your Pinned Feeds in the last 30 days.')).toHaveLength(shows.empty ? 1 : 0);
    expect(screen.queryAllByRole('button', { name: 'Manage Feeds' })).toHaveLength(shows.empty ? 1 : 0);
  });

  test('tapping the Pinned chip chooses Pinned, in the link, and All chooses everything again', async () => {
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', feeds: 'some', pins: 'two' });
    await user.press(await screen.findByRole('tab', { name: PINNED_CHIP }));
    expect(screen).toHavePathname('/');
    expect(screen).toHaveSearchParams({ feed: 'pinned' });
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(PINNED_CHIP);
    await user.press(screen.getByRole('tab', { name: 'All' }));
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('All');
  });

  test('switching to and from Pinned tells the rows which way to slide, as other chips do (P20)', async () => {
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', feeds: 'some', pins: 'two' });
    await screen.findAllByRole('link');
    expect(screen.getByTestId('chip-switch')).toHaveProp('index', 0);
    // Pinned sits second, right after All.
    await user.press(screen.getByRole('tab', { name: PINNED_CHIP }));
    expect(screen.getByTestId('chip-switch')).toHaveProp('index', 1);
    // Calm Notes isn't Pinned: choosing it folds the group, and it sits after the Pinned Feeds' places.
    await user.press(screen.getByRole('tab', { name: 'Calm Notes' }));
    expect(screen.getByTestId('chip-switch')).toHaveProp('index', 4);
  });

  test('empty Pinned leads to Manage Feeds (Q34)', async () => {
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', feeds: 'some', pins: 'quiet', feed: 'pinned' });
    await user.press(await screen.findByRole('button', { name: 'Manage Feeds' }));
    expect(screen).toHavePathname('/manage-feeds');
  });
});

describe('the Pinned group (FEE-60)', () => {
  const PINNED_CHIP = 'Pinned: The Verge, Daring Fireball';
  const OPEN = ['All', PINNED_CHIP, 'The Verge, Pinned', 'Daring Fireball, Pinned', 'Calm Notes'];
  const FOLDED = ['All', PINNED_CHIP, 'Calm Notes'];
  type Shows = { chips: string[]; selected: string; expanded: boolean | null };
  const SHOWS: Record<PinnedGroupWorldId, Shows> = {
    'group-open': { chips: OPEN, selected: 'The Verge, Pinned', expanded: true },
    'group-folded-all': { chips: FOLDED, selected: 'All', expanded: false },
    'group-folded-other': { chips: FOLDED, selected: 'Calm Notes', expanded: false },
    // With fewer than two Pins there's no group: the row is as it was before Pinned.
    'group-one-pin': { chips: ['All', 'The Verge, Pinned', 'Calm Notes', 'Daring Fireball'], selected: 'All', expanded: null },
    'group-no-pins': { chips: ['All', 'The Verge', 'Calm Notes', 'Daring Fireball'], selected: 'All', expanded: null },
    'group-link': { chips: OPEN, selected: 'Daring Fireball, Pinned', expanded: true },
    'group-remove-animations': { chips: OPEN, selected: PINNED_CHIP, expanded: true },
  };

  test.each(PINNED_GROUP_WORLDS)('$label', async ({ id, spec }) => {
    const shows = SHOWS[id];
    await open(spec);
    const tabs = await screen.findAllByRole('tab');
    expect(tabs.map((tab) => tab.props.accessibilityLabel)).toEqual(shows.chips);
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(shows.selected);
    const pinned = screen.queryByRole('tab', { name: PINNED_CHIP });
    if (shows.expanded === null) expect(pinned).not.toBeOnTheScreen();
    else if (shows.expanded) expect(pinned).toBeExpanded();
    else expect(pinned).toBeCollapsed();
  });

  test('choosing Pinned opens the group; moving among its Feeds keeps it open; All folds it', async () => {
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', feeds: 'some', pins: 'two' });
    const names = () => screen.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel);
    expect(names()).toEqual(FOLDED);
    await user.press(await screen.findByRole('tab', { name: PINNED_CHIP }));
    expect(names()).toEqual(OPEN);
    await user.press(screen.getByRole('tab', { name: 'Daring Fireball, Pinned' }));
    expect(names()).toEqual(OPEN);
    await user.press(screen.getByRole('tab', { name: 'The Verge, Pinned' }));
    expect(names()).toEqual(OPEN);
    await user.press(screen.getByRole('tab', { name: 'All' }));
    expect(names()).toEqual(FOLDED);
  });

  test('a Pinned Feed chosen: its chip is Gold, and the Pinned chip only shows the group is active (D5)', async () => {
    await open({ colorScheme: 'dark', feeds: 'some', pins: 'two', feed: 'f1' });
    const pinned = await screen.findByRole('tab', { name: PINNED_CHIP });
    expect(pinned).not.toBeSelected();
    // Full-strength text on a soft face, not Gold and not raised: active, without competing with the chosen Feed (D27).
    expect(within(pinned).getByText('Pinned', { includeHiddenElements: true })).toHaveProp('className', 'text-text');
    expect(faceOf(pinned)).toMatchObject(depthStyle('dark', 'soft'));
    expect(faceOf(screen.getByRole('tab', { name: 'The Verge, Pinned' }))).toMatchObject(depthStyle('dark', 'raised'));
    expect(within(screen.getByRole('tab', { name: 'The Verge, Pinned' })).getByText('The Verge', { includeHiddenElements: true })).toHaveProp(
      'className',
      'text-accent',
    );
  });

  test('TalkBack can expand and collapse the group without gestures (Q15)', async () => {
    await open({ colorScheme: 'dark', feeds: 'some', pins: 'two' });
    const folded = await screen.findByRole('tab', { name: PINNED_CHIP });
    expect(folded.props.accessibilityActions).toEqual([{ name: 'expand', label: 'Expand' }]);
    await act(async () => fireEvent(folded, 'accessibilityAction', { nativeEvent: { actionName: 'expand' } }));
    expect(screen).toHaveSearchParams({ feed: 'pinned' });
    const opened = screen.getByRole('tab', { name: PINNED_CHIP });
    expect(opened).toBeExpanded();
    expect(opened.props.accessibilityActions).toEqual([{ name: 'collapse', label: 'Collapse' }]);
    await act(async () => fireEvent(opened, 'accessibilityAction', { nativeEvent: { actionName: 'collapse' } }));
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('All');
    expect(screen.getByRole('tab', { name: PINNED_CHIP })).toBeCollapsed();
  });
});

describe("the Pinned chip's stacked icons (FEE-61)", () => {
  type Shows = {
    name: string;
    /** Each circle in order: an icon, or the initial a Feed without one shows (D14). */
    circles: ('icon' | 'initial')[];
    ids: string[];
    iconSize: number;
  };
  const SHOWS: Record<PinnedStackWorldId, Shows> = {
    'stack-three-dark': {
      name: 'Pinned: The Verge, Daring Fireball, Calm Notes',
      circles: ['icon', 'icon', 'initial'],
      ids: ['f1', 'f3', 'f2'],
      iconSize: 16,
    },
    'stack-three-light': {
      name: 'Pinned: The Verge, Daring Fireball, Calm Notes',
      circles: ['icon', 'icon', 'initial'],
      ids: ['f1', 'f3', 'f2'],
      iconSize: 16,
    },
    'stack-initial': { name: 'Pinned: Daring Fireball, Kottke', circles: ['icon', 'initial'], ids: ['f3', 'f9'], iconSize: 16 },
    'stack-two': { name: 'Pinned: The Verge, Daring Fireball', circles: ['icon', 'icon'], ids: ['f1', 'f3'], iconSize: 16 },
    // Icons beside text grow with it (Q16).
    'stack-largest-font': {
      name: 'Pinned: The Verge, Daring Fireball, Calm Notes',
      circles: ['icon', 'icon', 'initial'],
      ids: ['f1', 'f3', 'f2'],
      iconSize: 32,
    },
  };

  test.each(PINNED_STACK_WORLDS)('$label', async ({ id, spec }) => {
    const shows = SHOWS[id];
    await open(spec);
    const chip = await screen.findByRole('tab', { name: shows.name });
    const circles = within(chip).getAllByTestId(/^pinned-stack-(?!ring)/, { includeHiddenElements: true });
    expect(circles.map((circle) => circle.props.testID)).toEqual(
      shows.ids.map((feedId, i) => (shows.circles[i] === 'icon' ? `pinned-stack-${feedId}` : `pinned-stack-${feedId}-initial`)),
    );
    // 16 points, grown with Android's font size and the world's, as every icon beside text is (Q16).
    const side = shows.iconSize * Dimensions.get('window').fontScale;
    for (const circle of circles) expect(circle).toHaveStyle({ width: side });
    // TalkBack hears the Feeds by name, with its role and state, never the icons (Q15).
    expect(chip).toBeCollapsed();
  });

  test('each circle is a ringed disc, and every one after the first overlaps the one before', async () => {
    await open({ colorScheme: 'dark', feeds: 'some', pins: 'three' });
    const chip = await screen.findByRole('tab', { name: /^Pinned:/ });
    const rings = within(chip).getAllByTestId('pinned-stack-ring', { includeHiddenElements: true });
    expect(rings).toHaveLength(3);
    // Ringed in the chip's own face since FEE-74 (chip-row.test.tsx checks the colour).
    for (const ring of rings) expect(ring).toHaveProp('className', expect.stringContaining('border-2'));
    expect(rings[0].props.className).not.toContain('-ml-');
    for (const ring of rings.slice(1)) expect(ring.props.className).toContain('-ml-inside');
  });

  test('TalkBack hears the Feeds by name, never the icons (Q15)', async () => {
    await open({ colorScheme: 'dark', feeds: 'some', pins: 'three' });
    const chip = await screen.findByRole('tab', { name: 'Pinned: The Verge, Daring Fireball, Calm Notes' });
    expect(within(chip).getAllByTestId('pinned-stack-ring', { includeHiddenElements: true })).toHaveLength(3);
    // Hidden from accessibility: the default query, which skips hidden elements, finds none of them.
    expect(within(chip).queryAllByTestId('pinned-stack-ring')).toHaveLength(0);
  });
});

describe('Add a Feed', () => {
  const ERRORS = {
    'not-a-feed': 'That address isn’t an RSS or Atom feed. Try the site’s feed URL.',
    unreachable: 'Couldn’t reach that address. Check it, or enter the site’s feed URL.',
    'invalid-url': 'Enter a website or feed URL, like theverge.com.',
    'no-feed-found': 'No feed found at that address. Try the site’s feed URL.',
  };
  type Shows = { busy: boolean; error: string | null; choices: number; titleSize: number; theme: 'dark' | 'light' };
  const SHOWS: Record<AddFeedWorldId, Shows> = {
    'add-idle': { busy: false, error: null, choices: 0, titleSize: 24, theme: 'dark' },
    'add-busy': { busy: true, error: null, choices: 0, titleSize: 24, theme: 'dark' },
    'add-choose': { busy: false, error: null, choices: FIXTURE_CHOICES.length, titleSize: 24, theme: 'dark' },
    'add-no-feed': { busy: false, error: ERRORS['no-feed-found'], choices: 0, titleSize: 24, theme: 'light' },
    'add-not-a-feed': { busy: false, error: ERRORS['not-a-feed'], choices: 0, titleSize: 24, theme: 'dark' },
    'add-unreachable': { busy: false, error: ERRORS.unreachable, choices: 0, titleSize: 24, theme: 'light' },
    'add-largest-font': { busy: false, error: null, choices: FIXTURE_CHOICES.length, titleSize: 48, theme: 'dark' },
  };

  test.each(ADD_FEED_WORLDS)('$label', async ({ id, spec }) => {
    const shows = SHOWS[id];
    await open(spec);
    expect(await screen.findByRole('heading', { name: 'Add a Feed' })).toHaveStyle({ fontSize: shows.titleSize });
    const field = screen.getByLabelText('Website or feed URL');
    if (shows.busy) {
      expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled();
      expect(field).toHaveProp('editable', false);
    } else {
      expect(screen.getByRole('button', { name: 'Add Feed' })).toBeOnTheScreen();
    }
    if (shows.error) expect(screen.getByRole('alert')).toHaveTextContent(shows.error);
    else expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    expect(screen.queryAllByRole('button', { name: /, theverge\.com$/ })).toHaveLength(shows.choices);
    expect(Uniwind.currentTheme).toBe(shows.theme);
  });

  test('a site with several feeds lists them, each named and placed for TalkBack, and choosing one adds it', async () => {
    const user = userEvent.setup();
    const w = await open({ colorScheme: 'dark', section: 'add-feed', addFeed: 'choose' });
    expect(await screen.findByText('This site has more than one feed. Choose one.')).toBeOnTheScreen();
    const [first] = FIXTURE_CHOICES;
    await user.press(screen.getByRole('button', { name: `${first.title}, theverge.com` }));
    expect(w.feedsLog.added).toEqual([first.url]);
  });

  test('Add Feed waits for a URL', async () => {
    await open({ colorScheme: 'dark', section: 'add-feed' });
    expect(await screen.findByRole('button', { name: 'Add Feed' })).toBeDisabled();
  });

  test('adding a Feed sends the URL and returns to All', async () => {
    const user = userEvent.setup();
    const w = await open({ colorScheme: 'dark', feeds: 'some' });
    await user.press(await screen.findByRole('button', { name: 'Add a Feed' }));
    await user.type(await screen.findByLabelText('Website or feed URL'), 'https://www.theverge.com/rss/index.xml');
    await user.press(screen.getByRole('button', { name: 'Add Feed' }));
    expect(w.feedsLog.added).toEqual(['https://www.theverge.com/rss/index.xml']);
    expect(await screen.findByRole('heading', { name: 'Feeds' })).toBeOnTheScreen();
  });

  test('a Feed you already follow takes you back to its chip, with a quiet note naming it', async () => {
    const toast = jest.spyOn(ToastAndroid, 'show').mockImplementation(() => {});
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', feeds: 'some', addFeed: 'already' });
    await user.press(await screen.findByRole('button', { name: 'Add a Feed' }));
    await user.type(await screen.findByLabelText('Website or feed URL'), 'theverge.com');
    await user.press(screen.getByRole('button', { name: 'Add Feed' }));
    expect(await screen.findByRole('heading', { name: 'Feeds' })).toBeOnTheScreen();
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('The Verge, Pinned');
    expect(toast).toHaveBeenCalledWith('You already follow The Verge.', ToastAndroid.SHORT);
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    toast.mockRestore();
  });

  test('a failed add stays on the screen with the URL kept', async () => {
    const user = userEvent.setup();
    const w = await open({ colorScheme: 'dark', section: 'add-feed', addFeed: 'not-a-feed' });
    await user.type(await screen.findByLabelText('Website or feed URL'), 'https://example.com/');
    await user.press(screen.getByRole('button', { name: 'Add Feed' }));
    expect(w.feedsLog.added).toEqual(['https://example.com/']);
    expect(screen.getByRole('heading', { name: 'Add a Feed' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Website or feed URL')).toHaveDisplayValue('https://example.com/');
  });
});

describe('the Reading view', () => {
  type Shows = {
    heading: string;
    body: string | null;
    omittedLines: number;
    titleSize: number;
    theme: 'dark' | 'light';
    /** The quiet line about the page, for a summary-only Article (FEE-25). */
    note: string | null;
    /** Who wrote it, between the Subtitle and the meta (FEE-41). */
    byline: string | null;
    openButton: boolean;
    leadImage: boolean;
    /** The Feed name, a link to that Feed (FEE-47); null when there's no Article. */
    feed: string | null;
    /** The floating Save or Done (FEE-30); null when there's no Article. */
    pill: 'Save' | 'Done' | null;
  };
  const ARTICLE = FIXTURE_ARTICLE.title;
  const CALM = FIXTURE_EXTRACTING_ARTICLE.title;
  const SUBTITLE = FIXTURE_EXTRACTING_ARTICLE.subtitle!;
  const MISSING = 'This Article isn’t available.';
  const BRINGING = 'Bringing in the full Article from its page…';
  const UNREAD = 'This Article couldn’t be brought in from its page.';
  // An Article's headline is Literata 30 (D6); "not available" is the app speaking, in the interface's title.
  // Every Article with a link ends with Open original; the fallback offers it as its main action instead.
  const full = { omittedLines: 0, titleSize: 30, note: null, openButton: true, leadImage: false, byline: 'By Terrence O’Brien' } as const;
  const fallback = {
    heading: CALM,
    body: SUBTITLE,
    omittedLines: 0,
    titleSize: 30,
    note: UNREAD,
    openButton: true,
    leadImage: true,
    byline: null,
  } as const;
  const SHOWS: Record<ReadingWorldId, Shows> = {
    'reading-dark': { ...full, heading: ARTICLE, body: 'Talks resume next year.', theme: 'dark', feed: 'The Verge', pill: 'Save' },
    'reading-light': { ...full, heading: ARTICLE, body: 'Talks resume next year.', theme: 'light', feed: 'The Verge', pill: 'Save' },
    'reading-no-lead-image': { ...full, heading: ARTICLE, body: 'Talks resume next year.', theme: 'dark', feed: 'The Verge', pill: 'Save' },
    'reading-long-feed-name': { ...full, heading: ARTICLE, body: 'Talks resume next year.', theme: 'light', feed: 'The Verge - Full RSS for subscribers | The Verge', pill: 'Save' },
    'reading-several-authors': {
      ...full,
      heading: ARTICLE,
      body: 'Talks resume next year.',
      byline: 'By Terrence O’Brien, Emma Roth and 2 others',
      theme: 'dark',
      feed: 'The Verge',
      pill: 'Save',
    },
    'reading-no-author': { ...full, heading: ARTICLE, body: 'Talks resume next year.', byline: null, theme: 'light', feed: 'The Verge', pill: 'Save' },
    'reading-omitted': { ...full, heading: ARTICLE, body: 'And how the prices compare:', omittedLines: 2, theme: 'dark', feed: 'The Verge', pill: 'Save' },
    'reading-missing': { ...full, heading: MISSING, body: null, titleSize: 24, openButton: false, byline: null, theme: 'dark', feed: null, pill: null },
    'reading-extracting': { ...full, heading: CALM, body: SUBTITLE, note: BRINGING, byline: null, theme: 'dark', feed: 'Calm Notes', pill: 'Save' },
    'reading-unextracted': { ...fallback, theme: 'dark', feed: 'Calm Notes', pill: 'Save' },
    'reading-unextracted-no-image': { ...fallback, leadImage: false, theme: 'dark', feed: 'Calm Notes', pill: 'Save' },
    'reading-unextracted-light': { ...fallback, theme: 'light', feed: 'Calm Notes', pill: 'Save' },
    'reading-unextracted-largest-font': { ...fallback, titleSize: 60, theme: 'dark', feed: 'Calm Notes', pill: 'Save' },
    'reading-largest-font': { ...full, heading: ARTICLE, body: 'Talks resume next year.', titleSize: 60, theme: 'dark', feed: 'The Verge', pill: 'Save' },
    'reading-saved': { ...full, heading: ARTICLE, body: 'Talks resume next year.', theme: 'dark', feed: 'The Verge', pill: 'Done' },
    'reading-saved-light': { ...full, heading: ARTICLE, body: 'Talks resume next year.', theme: 'light', feed: 'The Verge', pill: 'Done' },
    // Opening, before the Article arrives: only the headline the list had, ready for its title to land on (FEE-48).
    'reading-opening': {
      heading: ARTICLE,
      body: null,
      omittedLines: 0,
      titleSize: 30,
      theme: 'dark',
      note: null,
      byline: null,
      openButton: false,
      leadImage: false,
      feed: null,
      pill: null,
    },
    // Its Feed is gone: the name stays, as plain text, with nowhere to link (T23).
    'reading-removed-feed': { ...full, heading: ARTICLE, body: 'Talks resume next year.', theme: 'dark', feed: null, pill: 'Done' },
  };

  describe('Save and Done (FEE-30)', () => {
    test('Save keeps it, with a haptic, says so, and offers Done in its place (Q3, Q35)', async () => {
      const w = await open({ colorScheme: 'dark', section: 'article' });
      await userEvent.press(await screen.findByRole('button', { name: 'Save' }));
      expect(w.feedsLog.saves).toEqual([FIXTURE_ROWS[0].id]);
      expect(Haptics.performAndroidHapticsAsync).toHaveBeenCalledWith(Haptics.AndroidHaptics.Confirm);
      expect(await screen.findByRole('button', { name: 'Done' })).toBeOnTheScreen();
      expect(within(await screen.findByTestId('undo-toast')).getByText('Saved.')).toBeOnTheScreen();
    });

    test('Done finishes it: back to the list, with Undo there (P8, Q35)', async () => {
      const w = await open({ colorScheme: 'dark', feeds: 'some', articleSaved: true }, '/');
      await userEvent.press(await screen.findByRole('link', { name: new RegExp(`^${FIXTURE_ROWS[0].title.slice(0, 20)}`) }));
      await userEvent.press(await screen.findByRole('button', { name: 'Done' }));
      expect(w.feedsLog.dones).toEqual([FIXTURE_ROWS[0].id]);
      expect(await screen.findByRole('heading', { name: 'Feeds' })).toBeOnTheScreen();
      expect(screen).toHavePathname('/');
      expect(within(await screen.findByTestId('undo-toast')).getByText('Marked Done.')).toBeOnTheScreen();
    });

    test("an Article whose Feed was removed names it, but can't link to it (T23)", async () => {
      await open({ colorScheme: 'dark', section: 'article', article: 'removed-feed', articleSaved: true });
      expect(await screen.findByText('Morning Brief')).toBeOnTheScreen();
      expect(screen.queryByRole('link', { name: /open its Articles$/ })).not.toBeOnTheScreen();
    });
  });

  test.each(READING_WORLDS)('$label', async ({ id, spec }) => {
    const shows = SHOWS[id];
    await open(spec);
    expect(await screen.findByRole('heading', { name: shows.heading })).toHaveStyle({ fontSize: shows.titleSize });
    if (shows.body) expect(screen.getByText(shows.body)).toBeOnTheScreen();
    expect(screen.queryAllByText(/isn’t shown here\./)).toHaveLength(shows.omittedLines);
    if (shows.note) expect(screen.getByText(shows.note)).toBeOnTheScreen();
    else expect(screen.queryByText(new RegExp(`${BRINGING}|${UNREAD}`))).not.toBeOnTheScreen();
    expect(screen.queryAllByRole('button', { name: 'Open original' })).toHaveLength(shows.openButton ? 1 : 0);
    if (shows.feed) expect(screen.getByRole('link', { name: `${shows.feed}, open its Articles` })).toBeOnTheScreen();
    else expect(screen.queryByRole('link', { name: /open its Articles$/ })).not.toBeOnTheScreen();
    expect(screen.queryAllByRole('button', { name: /^(Save|Done)$/ }).map((b) => b.props.accessibilityLabel)).toEqual(
      shows.pill ? [shows.pill] : [],
    );
    if (shows.byline) expect(screen.getByText(shows.byline)).toBeOnTheScreen();
    else expect(screen.queryByText(/^By /)).not.toBeOnTheScreen();
    // The fallback draws only the lead image, when there is one.
    if (shows.note === UNREAD) expect(screen.queryAllByTestId('block-image')).toHaveLength(shows.leadImage ? 1 : 0);
    expect(Uniwind.currentTheme).toBe(shows.theme);
  });

  test("the Feed name opens Feeds with that Feed chosen (FEE-47)", async () => {
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', feeds: 'some' }, `/article/${FIXTURE_ROWS[0].id}`);
    await user.press(await screen.findByRole('link', { name: 'The Verge, open its Articles' }));
    expect(await screen.findByRole('tab', { name: 'The Verge, Pinned', selected: true })).toBeOnTheScreen();
    expect(screen.queryByRole('heading', { name: ARTICLE })).not.toBeOnTheScreen();
  });

  /** Every text on screen, in the order TalkBack reaches it. */
  const readingOrder = () => screen.getAllByText(/.+/).map((node) => node.props.children).filter((text) => typeof text === 'string');

  test('reads in order: headline, Subtitle, byline, Feed, date, then the text (P13, Q15, FEE-41)', async () => {
    await open({ colorScheme: 'dark', section: 'article' });
    await screen.findByRole('heading', { name: ARTICLE });
    const order = readingOrder();
    const at = (text: string) => order.indexOf(text);
    expect(at(ARTICLE)).toBeLessThan(at(FIXTURE_ARTICLE.subtitle!));
    expect(at(FIXTURE_ARTICLE.subtitle!)).toBeLessThan(at('By Terrence O’Brien'));
    expect(at('By Terrence O’Brien')).toBeLessThan(at(FIXTURE_ARTICLE.feedTitle));
    expect(at(FIXTURE_ARTICLE.feedTitle)).toBeLessThan(at('Talks resume next year.'));
  });

  test("the Article is set for reading: Literata for its own words, the app's meta in Instrument Sans (D6)", async () => {
    await open({ colorScheme: 'dark', section: 'article' });
    expect(await screen.findByRole('heading', { name: ARTICLE })).toHaveStyle({ fontFamily: 'Literata', fontWeight: '600' });
    expect(screen.getByText(FIXTURE_ARTICLE.subtitle!)).toHaveStyle({ fontFamily: 'Literata', fontSize: 20 });
    expect(screen.getByRole('heading', { name: 'What was on the table' })).toHaveStyle({ fontFamily: 'Literata', fontSize: 22 });
    expect(screen.getByText(FIXTURE_ARTICLE.feedTitle)).toHaveStyle({ fontFamily: 'InstrumentSans' });
  });

  test("the byline reads at full strength, so it's the credit; the Feed and date stay quieter (FEE-41)", async () => {
    await open({ colorScheme: 'dark', section: 'article' });
    expect(await screen.findByText('By Terrence O’Brien')).toHaveProp('className', expect.stringContaining('text-text'));
    expect(screen.getByText('By Terrence O’Brien')).not.toHaveProp('className', expect.stringContaining('text-text-muted'));
    expect(screen.getByText(FIXTURE_ARTICLE.feedTitle)).toHaveProp('className', expect.stringContaining('text-text-muted'));
  });

  test("the lead image shows once, even when it's also the first image in the text", async () => {
    await open({ colorScheme: 'dark', section: 'article' });
    await screen.findByRole('heading', { name: ARTICLE });
    expect(screen.getAllByTestId('block-image')).toHaveLength(1);
  });

  test('an Article without a lead image goes straight from its meta to its text', async () => {
    await open({ colorScheme: 'dark', section: 'article', article: 'no-lead-image' });
    await screen.findByRole('heading', { name: ARTICLE });
    expect(screen.queryAllByTestId('block-image')).toHaveLength(0);
    expect(screen.queryByTestId('lead-image')).not.toBeOnTheScreen();
  });

  test("a long Feed name stays on one line, and the date is never cut", async () => {
    await open({ colorScheme: 'light', section: 'article', article: 'long-feed-name' });
    expect(await screen.findByText('The Verge - Full RSS for subscribers | The Verge')).toHaveProp('numberOfLines', 1);
    expect(screen.getByText(publishedDate(FIXTURE_ARTICLE.publishedAt))).not.toHaveProp('numberOfLines');
  });

  test("scrolled text passes under a still, page-coloured backing, never under the status bar's icons (Q18)", async () => {
    await open({ colorScheme: 'dark', section: 'article' });
    await screen.findByRole('heading', { name: ARTICLE });
    const backing = screen.getByTestId('status-bar-backing');
    expect(backing).toHaveProp('pointerEvents', 'none');
    expect(backing).toHaveProp('className', expect.stringContaining('bg-background'));
  });

  test('the Article ends plainly: a rule, then Open original, as a button (Q8)', async () => {
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', section: 'article' });
    await user.press(await screen.findByRole('button', { name: 'Open original' }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenLastCalledWith(FIXTURE_ARTICLE.link);
    expect(screen.getByTestId('article-end')).toBeOnTheScreen();
  });

  test("when the page couldn't be read, Open original opens it in the browser (Q6)", async () => {
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', section: 'article', article: 'unextracted' });
    await user.press(await screen.findByRole('button', { name: 'Open original' }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenLastCalledWith(FIXTURE_UNEXTRACTED_ARTICLE.link);
  });

  test('while the page is read, TalkBack hears it when the text arrives (Q15)', async () => {
    await open({ colorScheme: 'dark', section: 'article', article: 'extracting' });
    expect(await screen.findByText(BRINGING)).toHaveProp('accessibilityLiveRegion', 'polite');
  });

  test('draws every kind of block with native components (T17, Q8)', async () => {
    await open({ colorScheme: 'dark', section: 'article' });
    await screen.findByRole('heading', { name: ARTICLE_TITLE });
    expect(screen.getByRole('img', { name: 'A military drone on a runway' })).toBeOnTheScreen();
    expect(screen.getByText('Photo by John Moore / Getty Images')).toBeOnTheScreen();
    expect(screen.getByRole('heading', { name: 'What was on the table' })).toBeOnTheScreen();
    expect(screen.getByText(/A ban on weapons that pick targets/)).toBeOnTheScreen();
    expect(screen.getByText('The window for preventive regulation is closing.')).toBeOnTheScreen();
    expect(screen.getByText(/The Verge/)).toBeOnTheScreen();
  });

  test('opening an Article marks it Read (P7)', async () => {
    const w = await open({ colorScheme: 'dark', section: 'article' });
    await screen.findByRole('heading', { name: FIXTURE_ARTICLE.title });
    expect(w.feedsLog.read).toEqual([FIXTURE_ROWS[0].id]);
  });

  test('a missing Article marks nothing Read', async () => {
    const w = await open({ colorScheme: 'dark', section: 'article', article: 'missing' });
    await screen.findByRole('heading', { name: 'This Article isn’t available.' });
    expect(w.feedsLog.read).toEqual([]);
  });

  test('links and Open original open in the browser (Q8)', async () => {
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', section: 'article' });
    await user.press(await screen.findByRole('link', { name: 'Reuters reports' }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenLastCalledWith('https://www.reuters.com/');
    await user.press(screen.getByRole('button', { name: 'Open original' }));
    expect(WebBrowser.openBrowserAsync).toHaveBeenLastCalledWith(FIXTURE_ARTICLE.link);
  });

  test('an omitted block offers the original', async () => {
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', section: 'article', article: 'omitted' });
    expect(await screen.findByText('A video isn’t shown here.')).toBeOnTheScreen();
    expect(screen.getByText('A table isn’t shown here.')).toBeOnTheScreen();
    await user.press(screen.getAllByRole('link', { name: 'Open original' })[0]);
    expect(WebBrowser.openBrowserAsync).toHaveBeenLastCalledWith(FIXTURE_ARTICLE.link);
  });

  test.each([
    ['a too-long id', `/article/${'a'.repeat(200)}`],
    ['an id with symbols', '/article/..%2F..%2Fgallery'],
    ['an id with spaces', '/article/a%20b'],
    ['an upper-case id', '/article/A1'],
  ])('a link with %s shows nothing of any Article (Q25)', async (_case, url) => {
    await open({ colorScheme: 'dark', section: 'article' }, url);
    expect(await screen.findByRole('heading', { name: 'This Article isn’t available.' })).toBeOnTheScreen();
    expect(screen.queryByText('Talks resume next year.')).not.toBeOnTheScreen();
  });
});

describe('links into Feeds screens (Q25)', () => {
  test('unexpected parameters are ignored', async () => {
    await open({ colorScheme: 'dark', section: 'article' }, '/article/a1?id=../gallery&extra=%3Cscript%3E');
    expect(await screen.findByRole('heading', { name: FIXTURE_ARTICLE.title })).toBeOnTheScreen();
  });

  test.each(['/article/a1', '/add-feed'])('signed out, %s opens sign-in instead', async (url) => {
    await open({ colorScheme: 'dark', auth: 'signed-out' }, url);
    expect(await screen.findByRole('heading', { name: 'feedSmith' })).toBeOnTheScreen();
    expect(screen.queryByText('Talks resume next year.')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Website or feed URL')).not.toBeOnTheScreen();
  });
});

const ARTICLE_TITLE = FIXTURE_ARTICLE.title;

test('Manage this Feed opens Manage Feeds from a Feed with nothing new (FEE-47, Q34)', async () => {
  const user = userEvent.setup();
  await open({ colorScheme: 'dark', feeds: 'some', feed: 'f3' });
  await user.press(await screen.findByRole('button', { name: 'Manage this Feed' }));
  expect(await screen.findByRole('heading', { name: 'Manage Feeds' })).toBeOnTheScreen();
});

describe('buttons have depth, not outlines (FEE-75, D27)', () => {
  test.each(['dark', 'light'] as const)('in %s, the Reading view\'s Save is soft above the page and sinks when pressed', async (colorScheme) => {
    await open({ colorScheme, section: 'article' });
    const save = await screen.findByRole('button', { name: 'Save' });
    expect(faceOf(save)).toMatchObject(depthStyle(colorScheme, 'soft'));
    expect(save).not.toHaveStyle({ borderWidth: expect.any(Number) });
    await fireEvent(save, 'pressIn');
    expect(faceOf(screen.getByRole('button', { name: 'Save' }))).toMatchObject(depthStyle(colorScheme, 'pressed'));
  });

  test('Done, on a Saved Article, is soft too', async () => {
    await open({ colorScheme: 'dark', section: 'article', articleSaved: true });
    expect(faceOf(await screen.findByRole('button', { name: 'Done' }))).toMatchObject(depthStyle('dark', 'soft'));
  });

  test.each([
    ['Add a Feed', { colorScheme: 'dark', feeds: 'none' }],
    ['Open original', { colorScheme: 'light', section: 'article', article: 'unextracted' }],
    // The way to the original at the end of an Article that was read in full.
    ['Open original', { colorScheme: 'dark', section: 'article' }],
  ] as const)('%s is soft', async (name, spec) => {
    await open(spec);
    expect(faceOf(await screen.findByRole('button', { name }))).toMatchObject(depthStyle(spec.colorScheme, 'soft'));
  });
});

// FEE-48: opening an Article carries the row's title into the Reading view's headline, as one shared element
// (Reanimated's shared element transitions, a container transform in Material's terms, D29).
describe('the title carries from the row into the headline (FEE-48)', () => {
  /** The shared-element tag on the view around `element`, if any. */
  const tagOf = (element: { props: { sharedTransitionTag?: string }; parent: unknown }) => {
    for (let node = element as typeof element | null; node; node = node.parent as typeof element | null) {
      if (node.props.sharedTransitionTag) return node.props.sharedTransitionTag;
    }
    return undefined;
  };
  const [first] = FIXTURE_ROWS;

  test('the row\'s title and the opened Article\'s headline share one tag', async () => {
    await open({ colorScheme: 'dark', feeds: 'some' });
    const rowTitle = await screen.findByText(first.title);
    expect(tagOf(rowTitle)).toBe(`article-title-${first.id}`);
  });

  test('the Reading view\'s headline carries the same tag', async () => {
    await open({ colorScheme: 'dark', section: 'article' });
    const headline = await screen.findByRole('heading', { name: FIXTURE_ARTICLE.title });
    // The gallery and tests open the first fixture row's Article.
    expect(tagOf(headline)).toBe(`article-title-${first.id}`);
  });

  test('with Remove animations on, nothing is tagged, so opening is a plain cut (Q17)', async () => {
    await open({ colorScheme: 'dark', feeds: 'some', reduceMotion: true });
    expect(tagOf(await screen.findByText(first.title))).toBeUndefined();
  });
});

// FEE-48: the title can only travel to a headline that exists from the Reading view's first frame, and a
// headline swapped for another mid-flight is left invisible on Android. So while the Article loads, the title
// the list already had is shown, in the same headline that stays once the Article arrives.
describe('the headline is there from the first frame, and stays the same headline (FEE-48)', () => {
  const [first] = FIXTURE_ROWS;

  test('while the Article loads, the headline shows the title the list had, ready to land on', async () => {
    await open({ colorScheme: 'dark', section: 'article', article: 'loading-with-title' });
    const headline = await screen.findByRole('heading', { name: first.title });
    expect(headline).toBeOnTheScreen();
    // Nothing else yet: no Save, no text.
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeOnTheScreen();
  });

  test('when the Article arrives, the same headline stays: it is never swapped for another', async () => {
    let arrive: () => void = () => {};
    const world = createWorld({ colorScheme: 'dark', section: 'article' });
    // Loading, with the row's title, until `arrive`; then the world's real Article.
    const feeds = {
      ...world.feeds,
      useArticle: (id: string): ArticleView => {
        const real = world.feeds.useArticle(id);
        const [arrived, setArrived] = useState(false);
        arrive = () => setArrived(true);
        return arrived ? real : { status: 'loading', title: first.title };
      },
    };
    await renderWorld({ ...world, feeds });
    const before = await screen.findByRole('heading', { name: first.title });
    await act(async () => arrive());
    expect(await screen.findByRole('button', { name: 'Save' })).toBeOnTheScreen();
    expect(screen.getByRole('heading', { name: first.title })).toBe(before);
    world.dispose();
  });
});
