import { faceOf } from '../../../test/depth';
import { act, fireEvent, userEvent, within } from '@testing-library/react-native';
import { screen } from 'expo-router/testing-library';
import { useState } from 'react';
import { Alert, Animated, ScrollView, StyleSheet, ToastAndroid } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Uniwind } from 'uniwind';

import { NativeSheet } from '@/components/native-sheet';
import { publishedAgo, publishedDate } from '@/feeds/format';
import { depthStyle } from '@/theme/depth';
import { themes } from '@/theme/tokens';
import { spacing } from '@/theme/spacing';
import {
  ADD_FEED_WORLDS,
  ALL_WORLDS,
  NEW_ARTICLES_WORLDS,
  READING_WORLDS,
  type AddFeedWorldId,
  type AllWorldId,
  type NewArticlesWorldId,
  type ReadingWorldId,
} from '@/worlds/catalog';
import {
  FIXTURE_ARRIVED_ROWS,
  FIXTURE_ARTICLE,
  FIXTURE_CHOICES,
  FIXTURE_EXTRACTING_ARTICLE,
  FIXTURE_NOW,
  FIXTURE_ROWS,
  FIXTURE_UNEXTRACTED_ARTICLE,
} from '@/worlds/fixtures';
import type { ArticleView } from '@/feeds/feeds-data';
import { createWorld, type CatalogWorld, type World, type WorldSpec } from '@/worlds/world';
import { layOutList, renderWorld } from '../../../test/world-router';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

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
    /** A chosen Feed with no Articles yet offers Remove, by its name (Q34, FEE-97); null otherwise. */
    remove: string | null;
    /** The chip's menu, open: its one action, by name (FEE-97); null when closed. */
    menu: string | null;
  };
  const ROWS = FIXTURE_ROWS.length;
  const READ = FIXTURE_ROWS.filter((r) => r.read).length;
  const VERGE_ROWS = FIXTURE_ROWS.filter((r) => r.feedId === 'f1').length;
  const SHOWS: Record<AllWorldId, Shows> = {
    'all-dark': { rows: ROWS, read: READ, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: 'All', feedNames: ROWS, updated: 'Updated 5 min ago', remove: null, menu: null },
    'all-light': { rows: ROWS, read: READ, empty: false, refreshing: false, theme: 'light', titleSize: 24, selected: 'All', feedNames: ROWS, updated: 'Updated 5 min ago', remove: null, menu: null },
    'all-read': { rows: ROWS, read: ROWS, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: 'All', feedNames: ROWS, updated: 'Updated 5 min ago', remove: null, menu: null },
    'all-empty': { rows: 0, read: 0, empty: true, refreshing: false, theme: 'dark', titleSize: 24, selected: '', feedNames: 0, updated: null, remove: null, menu: null },
    'all-loading': { rows: 0, read: 0, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: '', feedNames: 0, updated: null, remove: null, menu: null },
    'all-refreshing': { rows: ROWS, read: READ, empty: false, refreshing: true, theme: 'light', titleSize: 24, selected: 'All', feedNames: ROWS, updated: 'Updating…', remove: null, menu: null },
    'all-largest-font': { rows: ROWS, read: READ, empty: false, refreshing: false, theme: 'dark', titleSize: 48, selected: 'All', feedNames: ROWS, updated: 'Updated 5 min ago', remove: null, menu: null },
    'all-feed': { rows: VERGE_ROWS, read: 1, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: 'The Verge', feedNames: 0, updated: 'Updated 5 min ago', remove: null, menu: null },
    'all-feed-light': { rows: 1, read: 0, empty: false, refreshing: false, theme: 'light', titleSize: 24, selected: 'Calm Notes', feedNames: 0, updated: 'Updated 5 min ago', remove: null, menu: null },
    // FEE-93: empty only for a Feed that has never had an Article.
    'all-feed-empty': { rows: 0, read: 0, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: 'Farnam Street', feedNames: 0, updated: 'Updated 5 min ago', remove: 'Remove Farnam Street', menu: null },
    // FEE-93: a rare writer's last two posts, months old, one Read; never an empty page.
    'feed-rare': { rows: 2, read: 1, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: 'Daring Fireball', feedNames: 0, updated: 'Updated 5 min ago', remove: null, menu: null },
    'feed-rare-light': { rows: 2, read: 1, empty: false, refreshing: false, theme: 'light', titleSize: 24, selected: 'Daring Fireball', feedNames: 0, updated: 'Updated 5 min ago', remove: null, menu: null },
    // FEE-93: a frequent site shows its whole last 30 days, more than five.
    'feed-frequent': { rows: VERGE_ROWS + 4, read: 1, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: 'The Verge', feedNames: 0, updated: 'Updated 5 min ago', remove: null, menu: null },
    'all-many-feeds': { rows: ROWS, read: READ, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: 'All', feedNames: ROWS, updated: 'Updated 5 min ago', remove: null, menu: null },
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
      remove: null,
      menu: null,
    },
    // FEE-97: a Feed chip's long-press menu, holding Remove.
    'feed-menu': { rows: VERGE_ROWS, read: 1, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: 'The Verge', feedNames: 0, updated: 'Updated 5 min ago', remove: null, menu: 'Remove The Verge' },
    'feed-menu-light': { rows: VERGE_ROWS, read: 1, empty: false, refreshing: false, theme: 'light', titleSize: 24, selected: 'The Verge', feedNames: 0, updated: 'Updated 5 min ago', remove: null, menu: 'Remove The Verge' },
    'feed-menu-largest-font': { rows: VERGE_ROWS, read: 1, empty: false, refreshing: false, theme: 'dark', titleSize: 48, selected: 'The Verge', feedNames: 0, updated: 'Updated 5 min ago', remove: null, menu: 'Remove The Verge' },
    'all-remove-animations': { rows: ROWS, read: READ, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: 'All', feedNames: ROWS, updated: 'Updated 5 min ago', remove: null, menu: null },
  };

  test.each(ALL_WORLDS)('$label', async ({ id, spec }) => {
    const shows = SHOWS[id];
    await open(spec);
    // A world with a chip's menu open: the gallery opens it at once; here, a long-press does (FEE-97).
    if ('chipMenu' in spec) await userEvent.longPress(await screen.findByRole('tab', { name: 'The Verge' }));
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
    if (shows.updated) expect(screen.getByTestId('updated-line')).toHaveAccessibleName(shows.updated);
    else expect(screen.queryByTestId('updated-line')).not.toBeOnTheScreen();
    // Nothing manages Feeds any more but Remove (FEE-97).
    expect(screen.queryByText(/Manage/)).not.toBeOnTheScreen();
    expect(screen.queryAllByRole('button', { name: /^Remove / })).toHaveLength(shows.remove ? 1 : 0);
    if (shows.remove) expect(screen.getByRole('button', { name: shows.remove })).toBeOnTheScreen();
    expect(screen.queryAllByRole('menuitem')).toHaveLength(shows.menu ? 1 : 0);
    if (shows.menu) expect(screen.getByRole('menuitem', { name: shows.menu })).toBeOnTheScreen();
    if (shows.selected) expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(shows.selected);
    expect(screen.queryAllByTestId('row-feed-name')).toHaveLength(shows.feedNames);
    expect(Uniwind.currentTheme).toBe(shows.theme);
  });

  // FEE-94: Pinned is gone: no Pinned chip, group or tray. FEE-97: a Feed's chip holds Remove, on a long-press and for TalkBack.
  test.each(['dark', 'light'] as const)(
    'the chip row in %s: All, then one chip per Feed, named by the Feed alone; no + chip and no Pinned (P5, P9, FEE-44, FEE-94)',
    async (colorScheme) => {
      await open({ colorScheme, feeds: 'some' });
      const tabs = await screen.findAllByRole('tab');
      const names = ['All', 'The Verge', 'Calm Notes', 'Daring Fireball'];
      expect(tabs).toHaveLength(names.length);
      tabs.forEach((tab, i) => expect(tab).toHaveAccessibleName(names[i]));
      expect(screen.queryByText('+')).not.toBeOnTheScreen();
      expect(screen.queryByRole('tab', { name: /Pinned/ })).not.toBeOnTheScreen();
      expect(screen.queryByTestId('pinned-tray', { includeHiddenElements: true })).not.toBeOnTheScreen();
      expect(screen.queryByTestId('pinned-glyph', { includeHiddenElements: true })).not.toBeOnTheScreen();
      expect(tabs[0].props.onLongPress).toBeUndefined();
      expect(tabs[0].props.accessibilityActions ?? []).toEqual([]);
      tabs.slice(1).forEach((tab, i) =>
        expect(tab.props.accessibilityActions).toEqual([{ name: 'remove', label: `Remove ${names[i + 1]}` }]),
      );
    },
  );

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
    const chip = await screen.findByRole('tab', { name: 'The Verge - Full RSS for subscribers | The Verge' });
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
    expect(within(calm).getByText('Calm Notes')).toHaveStyle({ color: themes[colorScheme].textMuted });
    expect(within(all).getByText('All')).toHaveStyle({ color: themes[colorScheme].accent });
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

  // FEE-93: a Feed's page is empty only when the Feed has never had an Article, and says so plainly.
  test('a Feed with no Articles yet says so, by name', async () => {
    await open({ colorScheme: 'dark', feeds: 'some', chips: 'many', feed: 'f4' });
    expect(await screen.findByText('No Articles from Farnam Street yet.')).toBeOnTheScreen();
  });

  test("a rare writer's page shows its last posts, newest first, though they're months old; All doesn't", async () => {
    await open({ colorScheme: 'dark', feeds: 'some', feed: 'f3' });
    const rows = await screen.findAllByRole('link');
    expect(rows.map((row) => row.props.accessibilityLabel)).toEqual([
      expect.stringMatching(/^The iPhone’s quiet year/),
      expect.stringMatching(/^Notes on a long summer.*, Read$/),
    ]);
    expect(screen.queryByText(/No Articles from Daring Fireball/)).not.toBeOnTheScreen();
    await userEvent.press(screen.getByRole('tab', { name: 'All' }));
    expect(screen.queryAllByRole('link', { name: /quiet year|long summer/ })).toHaveLength(0);
  });

  test("an old post on a rare writer's page opens in the Reading view", async () => {
    await open({ colorScheme: 'dark', feeds: 'some', feed: 'f3' });
    await userEvent.press((await screen.findAllByRole('link'))[0]);
    expect(screen).toHavePathname('/article/k1');
  });

  test.each([
    ['not one of yours', '/?feed=someone-elses'],
    ['malformed', '/?feed=%3Cscript%3E'],
    ['oversized', `/?feed=${'a'.repeat(500)}`],
    // FEE-94: Pinned is gone; an old link to it lands on All.
    ['the old Pinned view', '/?feed=pinned'],
  ])('a link to a Feed that is %s opens All (Q25)', async (_case, url) => {
    await open({ colorScheme: 'dark', feeds: 'some' }, url);
    expect(await screen.findByRole('tab', { selected: true })).toHaveAccessibleName('All');
  });

  // FEE-117: a chip changes state the Material way: its face and label ease (`chipSettle`), nothing springs.
  describe('choosing a chip eases its colour, with no bounce (D12, Q17)', () => {
    let spring: jest.SpyInstance;
    beforeEach(() => {
      spring = jest.spyOn(Animated, 'spring');
    });
    afterEach(() => spring.mockRestore());

    test.each([false, true])('with Remove animations %s, the chosen chip changes with nothing springing or scaling', async (reduceMotion) => {
      const user = userEvent.setup();
      await open({ colorScheme: 'dark', feeds: 'some', reduceMotion });
      await user.press(await screen.findByRole('tab', { name: 'Calm Notes' }));
      const chip = screen.getByRole('tab', { name: 'Calm Notes' });
      expect(chip).toBeSelected();
      expect(faceOf(chip)).toMatchObject(depthStyle('dark', 'raised'));
      expect(within(chip).getByText('Calm Notes')).toHaveStyle({ color: themes.dark.accent });
      expect(spring).not.toHaveBeenCalled();
      expect(JSON.stringify(StyleSheet.flatten(chip.props.style) ?? {})).not.toContain('scale');
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
      `${second.title}, By Emma Roth and Jay Peters, The Verge, ${publishedAgo(second.publishedAt, FIXTURE_NOW)}, Read`,
    );
    const [, , third] = FIXTURE_ROWS;
    expect(rows[2]).toHaveAccessibleName(`${third.title}, The Verge, ${publishedAgo(third.publishedAt, FIXTURE_NOW)}`);
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
  ] as const)('Add a Feed in %s opens the add sheet over Feeds, which stays behind it (FEE-45, Q32)', async (_where, feeds) => {
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', feeds });
    await user.press(await screen.findByRole('button', { name: 'Add a Feed' }));
    expect(jest.mocked(NativeSheet)).toHaveBeenLastCalledWith(expect.objectContaining({ open: true }), undefined);
    expect(within(screen.getByTestId('add-feed-sheet')).getByRole('heading', { name: 'Add a Feed' })).toBeOnTheScreen();
    expect(screen.getByRole('heading', { name: 'Feeds' })).toBeOnTheScreen();
  });

});

describe('Add a Feed, in its sheet over Feeds (FEE-45)', () => {
  const FIELD = 'Website or feed URL';
  /** Opens a world on Feeds and taps Add a Feed (the + or the empty state's button): the sheet rises. */
  const openSheet = async (spec: WorldSpec) => {
    const w = await open(spec);
    await userEvent.press(await screen.findByRole('button', { name: 'Add a Feed' }));
    return w;
  };
  const sheet = () => screen.getByTestId('add-feed-sheet');
  const sheetOpen = (open: boolean) =>
    expect(jest.mocked(NativeSheet)).toHaveBeenLastCalledWith(expect.objectContaining({ open }), undefined);
  beforeEach(() => jest.mocked(NativeSheet).mockClear());
  const ERRORS = {
    'not-a-feed': 'That address isn’t an RSS or Atom feed. Try the site’s feed URL.',
    unreachable: 'Couldn’t reach that address. Check it, or enter the site’s feed URL.',
    'invalid-url': 'Enter a website or feed URL, like theverge.com.',
    'no-feed-found': 'No feed found at that address. Try the site’s feed URL.',
  };
  type Shows = {
    button: 'Add Feed' | 'Adding…';
    error: string | null;
    choices: number;
    titleSize: number;
    theme: 'dark' | 'light';
  };
  const base = { error: null, choices: 0, titleSize: 24 } as const;
  const SHOWS: Record<AddFeedWorldId, Shows> = {
    'add-idle': { ...base, button: 'Add Feed', theme: 'dark' },
    'add-busy': { ...base, button: 'Adding…', theme: 'dark' },
    'add-choose': { ...base, button: 'Add Feed', choices: FIXTURE_CHOICES.length, theme: 'dark' },
    'add-no-feed': { ...base, button: 'Add Feed', error: ERRORS['no-feed-found'], theme: 'light' },
    'add-not-a-feed': { ...base, button: 'Add Feed', error: ERRORS['not-a-feed'], theme: 'dark' },
    'add-unreachable': { ...base, button: 'Add Feed', error: ERRORS.unreachable, theme: 'light' },
    'add-invalid': { ...base, button: 'Add Feed', error: ERRORS['invalid-url'], theme: 'dark' },
    'add-largest-font': { ...base, button: 'Add Feed', choices: FIXTURE_CHOICES.length, titleSize: 48, theme: 'dark' },
  };

  test.each(ADD_FEED_WORLDS)('$label', async ({ id, spec }) => {
    const shows = SHOWS[id];
    await openSheet(spec);
    sheetOpen(true);
    expect(within(sheet()).getByRole('heading', { name: 'Add a Feed' })).toHaveStyle({ fontSize: shows.titleSize });
    const field = screen.getByLabelText(FIELD);
    const button = screen.getByRole('button', { name: shows.button });
    if (shows.button === 'Adding…') {
      expect(button).toBeDisabled();
      expect(field).toHaveProp('editable', false);
    } else {
      expect(button).toBeOnTheScreen();
    }
    if (shows.error) expect(screen.getByRole('alert')).toHaveTextContent(shows.error);
    else expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    const choices = screen.queryAllByRole('button', { name: /, theverge\.com$/ });
    expect(choices).toHaveLength(shows.choices);
    // FEE-81: a site's feeds stand on the sheet as soft cards, not outlined. The field is Material's own (D44).
    for (const choice of choices) expect(faceOf(choice)).toMatchObject(depthStyle(shows.theme, 'soft'));
    // One field, for an address: it never asks for a name (FEE-96).
    expect(screen.queryByText(/name/i)).not.toBeOnTheScreen();
    expect(Uniwind.currentTheme).toBe(shows.theme);
  });

  test('a site with several feeds lists them, each named and placed for TalkBack, and choosing one adds it', async () => {
    const user = userEvent.setup();
    const w = await openSheet({ colorScheme: 'dark', addFeed: 'choose' });
    expect(await screen.findByText('This site has more than one feed. Choose one.')).toBeOnTheScreen();
    const [first] = FIXTURE_CHOICES;
    await user.press(screen.getByRole('button', { name: `${first.title}, theverge.com` }));
    expect(w.feedsLog.added).toEqual([first.url]);
  });

  test('Add Feed waits for an address', async () => {
    await openSheet({ colorScheme: 'dark' });
    expect(await screen.findByRole('button', { name: 'Add Feed' })).toBeDisabled();
  });

  test('text that isn’t an address says so and keeps the sheet open, rather than searching (FEE-96)', async () => {
    const user = userEvent.setup();
    const w = await openSheet({ colorScheme: 'dark' });
    await user.type(await screen.findByLabelText(FIELD), 'the verge');
    expect(screen.queryByRole('button', { name: /Find/ })).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Add Feed' }));
    expect(screen.getByRole('alert')).toHaveTextContent(ERRORS['invalid-url']);
    expect(w.feedsLog.added).toEqual([]);
    sheetOpen(true);
    expect(screen.getByLabelText(FIELD)).toHaveDisplayValue('the verge');
  });

  test('adding a Feed sends the URL, closes the sheet and opens the new Feed on its chip', async () => {
    const user = userEvent.setup();
    const w = await openSheet({ colorScheme: 'dark', feeds: 'some' });
    await user.type(await screen.findByLabelText(FIELD), 'https://www.theverge.com/rss/index.xml');
    await user.press(screen.getByRole('button', { name: 'Add Feed' }));
    expect(w.feedsLog.added).toEqual(['https://www.theverge.com/rss/index.xml']);
    sheetOpen(false);
    expect(await screen.findByRole('tab', { selected: true })).toHaveAccessibleName('Kottke');
  });

  test('the first Feed, added from the empty state, opens on its chip too', async () => {
    const user = userEvent.setup();
    await openSheet({ colorScheme: 'dark', feeds: 'none' });
    await user.type(await screen.findByLabelText(FIELD), 'kottke.org');
    await user.press(screen.getByRole('button', { name: 'Add Feed' }));
    sheetOpen(false);
    expect(await screen.findByRole('tab', { selected: true })).toHaveAccessibleName('Kottke');
  });

  test('after a Feed is added, the next opening starts empty', async () => {
    const user = userEvent.setup();
    await openSheet({ colorScheme: 'dark', feeds: 'some' });
    await user.type(await screen.findByLabelText(FIELD), 'kottke.org');
    await user.press(screen.getByRole('button', { name: 'Add Feed' }));
    sheetOpen(false);
    await user.press(screen.getByRole('button', { name: 'Add a Feed' }));
    expect(screen.getByLabelText(FIELD)).toHaveDisplayValue('');
  });

  test('closing the sheet (Back, a swipe) keeps what was typed for the next time it opens', async () => {
    const user = userEvent.setup();
    const w = await openSheet({ colorScheme: 'dark', feeds: 'some' });
    await user.type(await screen.findByLabelText(FIELD), 'kottke');
    // The native sheet reports every kind of dismissal as onClose.
    await act(async () => jest.mocked(NativeSheet).mock.lastCall![0].onClose());
    sheetOpen(false);
    await user.press(screen.getByRole('button', { name: 'Add a Feed' }));
    expect(screen.getByLabelText(FIELD)).toHaveDisplayValue('kottke');
    expect(w.feedsLog.added).toEqual([]);
  });

  test('a Feed you already follow closes the sheet on its chip, with a quiet note naming it', async () => {
    const toast = jest.spyOn(ToastAndroid, 'show').mockImplementation(() => {});
    const user = userEvent.setup();
    await openSheet({ colorScheme: 'dark', feeds: 'some', addFeed: 'already' });
    await user.type(await screen.findByLabelText(FIELD), 'theverge.com');
    await user.press(screen.getByRole('button', { name: 'Add Feed' }));
    sheetOpen(false);
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('The Verge');
    expect(toast).toHaveBeenCalledWith('You already follow The Verge.', ToastAndroid.SHORT);
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    toast.mockRestore();
  });

  test('a failed add keeps the sheet open, with the URL kept', async () => {
    const user = userEvent.setup();
    const w = await openSheet({ colorScheme: 'dark', addFeed: 'not-a-feed' });
    await user.type(await screen.findByLabelText(FIELD), 'https://example.com/');
    await user.press(screen.getByRole('button', { name: 'Add Feed' }));
    expect(w.feedsLog.added).toEqual(['https://example.com/']);
    sheetOpen(true);
    expect(screen.getByLabelText(FIELD)).toHaveDisplayValue('https://example.com/');
  });
});

describe('new Articles arriving while you read (FEE-102)', () => {
  const NOTE = 'New Articles, go to top';
  /** Scrolls the list as a finger would: past the header, or back to the top. */
  const scrollList = async (y: number) =>
    fireEvent.scroll(screen.getByTestId('all-list'), {
      nativeEvent: {
        contentOffset: { x: 0, y },
        contentSize: { width: 412, height: 2000 },
        layoutMeasurement: { width: 412, height: 915 },
      },
    });
  const arrive = async () => {
    await act(async () => world!.feeds.arrive());
    await layOutList('all-list');
  };
  /** Opens a world, scrolled down when it says so, and lets its new Articles arrive. */
  const openAndArrive = async (spec: WorldSpec) => {
    await open(spec);
    await screen.findAllByRole('link');
    if (spec.scrolled) await scrollList(600);
    expect(screen.queryByRole('button', { name: NOTE })).not.toBeOnTheScreen();
    await arrive();
  };

  type Shows = { note: boolean; theme: 'dark' | 'light'; labelSize: number };
  const SHOWS: Record<NewArticlesWorldId, Shows> = {
    'arrive-scrolled': { note: true, theme: 'dark', labelSize: 13 },
    'arrive-scrolled-light': { note: true, theme: 'light', labelSize: 13 },
    'arrive-scrolled-largest-font': { note: true, theme: 'dark', labelSize: 26 },
    'arrive-scrolled-remove-animations': { note: true, theme: 'dark', labelSize: 13 },
    'arrive-top': { note: false, theme: 'dark', labelSize: 13 },
    'arrive-top-remove-animations': { note: false, theme: 'dark', labelSize: 13 },
    'arrive-feed-scrolled': { note: true, theme: 'dark', labelSize: 13 },
  };

  test.each(NEW_ARTICLES_WORLDS)('$label', async ({ id, spec }) => {
    const shows = SHOWS[id];
    await openAndArrive(spec);
    // At the top the new Articles are in view; scrolled down they wait above, and the note says so.
    if (!shows.note) {
      for (const row of FIXTURE_ARRIVED_ROWS) expect(screen.getByText(row.title)).toBeOnTheScreen();
    }
    const note = screen.queryByRole('button', { name: NOTE });
    if (!shows.note) {
      expect(note).not.toBeOnTheScreen();
      return;
    }
    expect(note).toBeOnTheScreen();
    // Says only that there are new Articles, never how many (P7).
    expect(within(note!).getByText('New Articles')).toHaveStyle({ fontSize: shows.labelSize });
    expect(within(note!).queryByText(/\d/)).not.toBeOnTheScreen();
    // A raised object over the rows it floats above, its label full-strength, not Gold (D5, D27).
    expect(faceOf(note!)).toMatchObject(depthStyle(shows.theme, 'raised'));
    expect(within(note!).getByText('New Articles')).toHaveProp('className', expect.stringContaining('text-text'));
    expect(within(note!).getByText('New Articles')).not.toHaveProp('className', expect.stringContaining('text-accent'));
  });

  test('tapping the note goes to the top, where the new Articles are, and the note goes', async () => {
    await openAndArrive({ colorScheme: 'dark', feeds: 'busy', arrivals: 'later', scrolled: true });
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo');
    await userEvent.press(screen.getByRole('button', { name: NOTE }));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ y: 0 }));
    expect(screen.queryByRole('button', { name: NOTE })).not.toBeOnTheScreen();
    scrollTo.mockRestore();
  });

  test('scrolling to the top yourself clears the note too', async () => {
    await openAndArrive({ colorScheme: 'dark', feeds: 'busy', arrivals: 'later', scrolled: true });
    expect(screen.getByRole('button', { name: NOTE })).toBeOnTheScreen();
    await scrollList(0);
    expect(screen.queryByRole('button', { name: NOTE })).not.toBeOnTheScreen();
    // Scrolling down again doesn't bring it back: what arrived is in view now.
    await scrollList(600);
    expect(screen.queryByRole('button', { name: NOTE })).not.toBeOnTheScreen();
  });

  test("switching chips while scrolled shows no note: another chip's Articles are a new list", async () => {
    await open({ colorScheme: 'dark', feeds: 'busy', scrolled: true });
    await screen.findAllByRole('link');
    await scrollList(600);
    await userEvent.press(screen.getByRole('tab', { name: 'Calm Notes' }));
    await layOutList('all-list');
    expect(screen.queryByRole('button', { name: NOTE })).not.toBeOnTheScreen();
  });

  test('a first load, filling an empty screen, shows no note', async () => {
    await open({ colorScheme: 'dark', feeds: 'busy', scrolled: true });
    expect(await screen.findAllByRole('link')).not.toHaveLength(0);
    expect(screen.queryByRole('button', { name: NOTE })).not.toBeOnTheScreen();
  });
});

describe('the "Updated" line changes with the rows, never ahead (FEE-103)', () => {
  /**
   * Pulling down, and when its results reach the screen: after the pull answers, or before it. They open
   * looking exactly like All (and the gallery would play their arrival at once), so they live here, not in
   * the catalog's gallery.
   */
  const PULL_WORLDS = [
    { id: 'pull-results-late', label: 'A pull whose results arrive after it answers', spec: { colorScheme: 'dark', feeds: 'busy', arrivals: 'later', pull: 'late' } },
    { id: 'pull-results-early', label: 'A pull whose results arrive before it answers', spec: { colorScheme: 'dark', feeds: 'busy', arrivals: 'later', pull: 'early' } },
  ] as const satisfies readonly CatalogWorld[];
  type PullWorldId = (typeof PULL_WORLDS)[number]['id'];
  const NEW_TITLE = FIXTURE_ARRIVED_ROWS[0].title;
  const pull = async () => {
    const control = screen.getByTestId('all-list').props.refreshControl;
    await act(async () => control.props.onRefresh());
  };
  /** The line, as TalkBack hears it: one line, though it's drawn in parts (FEE-104). */
  const line = () => screen.getByTestId('updated-line');

  test('a background fetch: the new rows and "Updated just now" arrive in the same render', async () => {
    await open({ colorScheme: 'dark', feeds: 'busy', arrivals: 'later' });
    await screen.findAllByRole('link');
    expect(line()).toHaveAccessibleName('Updated 5 min ago');
    await act(async () => world!.feeds.arrive());
    await layOutList('all-list');
    expect(line()).toHaveAccessibleName('Updated just now');
    expect(screen.getByText(NEW_TITLE)).toBeOnTheScreen();
  });

  type Shows = {
    /** The line right after the pull answers. */
    answered: string;
    /** Whether the pull's new Articles are on screen then. */
    rowsWhenAnswered: boolean;
  };
  const SHOWS: Record<PullWorldId, Shows> = {
    // The pull answered first: "Updating…" holds, never showing the old time, until its results are in.
    'pull-results-late': { answered: 'Updating…', rowsWhenAnswered: false },
    // The results came first: as the pull answers, the line turns straight to "Updated just now".
    'pull-results-early': { answered: 'Updated just now', rowsWhenAnswered: true },
  };

  test.each(PULL_WORLDS)('$label', async ({ id, spec }) => {
    const shows = SHOWS[id];
    await open(spec);
    await screen.findAllByRole('link');
    expect(line()).toHaveAccessibleName('Updated 5 min ago');
    await pull();
    await layOutList('all-list');
    expect(line()).toHaveAccessibleName(shows.answered);
    expect(screen.queryByText(NEW_TITLE) !== null).toBe(shows.rowsWhenAnswered);
    expect(screen.getByTestId('all-list').props.refreshControl.props.refreshing).toBe(shows.answered === 'Updating…');
    if (!shows.rowsWhenAnswered) {
      await act(async () => world!.feeds.arrive());
      await layOutList('all-list');
      expect(line()).toHaveAccessibleName('Updated just now');
      expect(screen.getByText(NEW_TITLE)).toBeOnTheScreen();
      expect(screen.getByTestId('all-list').props.refreshControl.props.refreshing).toBe(false);
    }
    // Never a count, only when (P7, D20).
    expect(line()).not.toHaveAccessibleName(/\d+ (new|Articles)/);
  });

  test('a pull that fetched nothing new ends at once, the line back to its time', async () => {
    await open({ colorScheme: 'dark', feeds: 'some' });
    await screen.findAllByRole('link');
    await pull();
    expect(line()).toHaveAccessibleName('Updated 5 min ago');
    expect(screen.getByTestId('all-list').props.refreshControl.props.refreshing).toBe(false);
  });
});

describe('the "Updated" line moves only where it changes (FEE-104)', () => {
  test('it is drawn in two parts: "Updated" stays, only the time changes, and TalkBack hears one line', async () => {
    await open({ colorScheme: 'dark', feeds: 'busy', arrivals: 'later' });
    await screen.findAllByRole('link');
    const line = screen.getByTestId('updated-line');
    const still = within(line).getByText('Updated');
    expect(within(line).getByText('5 min ago')).toBeOnTheScreen();
    await act(async () => world!.feeds.arrive());
    expect(within(screen.getByTestId('updated-line')).getByText('Updated')).toBe(still);
    expect(within(screen.getByTestId('updated-line')).getByText('just now')).toBeOnTheScreen();
    expect(within(screen.getByTestId('updated-line')).queryByText('5 min ago')).not.toBeOnTheScreen();
    expect(screen.getByTestId('updated-line')).toHaveAccessibleName('Updated just now');
  });

  test('a minute passing changes only the line: the Feeds screen around it does not render again (FEE-106)', async () => {
    jest.useFakeTimers();
    try {
      world = createWorld({ colorScheme: 'dark', feeds: 'some' });
      let time = FIXTURE_NOW;
      world.environment.now = () => time;
      // Only the Feeds screen reads the pull, so its reads count the screen's renders.
      const read = world.feeds.useRefresh;
      let screenRenders = 0;
      world.feeds.useRefresh = () => {
        screenRenders += 1;
        return read();
      };
      await renderWorld(world);
      await layOutList('all-list');
      await screen.findAllByRole('link');
      expect(screen.getByTestId('updated-line')).toHaveAccessibleName('Updated 5 min ago');

      const before = screenRenders;
      time += 60_000;
      await act(async () => jest.advanceTimersByTime(60_000));
      expect(screen.getByTestId('updated-line')).toHaveAccessibleName('Updated 6 min ago');
      expect(screenRenders).toBe(before);
    } finally {
      jest.useRealTimers();
    }
  });

  test('while updating, the line is the one word "Updating…"', async () => {
    await open({ colorScheme: 'light', feeds: 'some', refreshing: true });
    await screen.findAllByRole('link');
    expect(within(screen.getByTestId('updated-line')).getByText('Updating…')).toBeOnTheScreen();
    expect(screen.getByTestId('updated-line')).toHaveAccessibleName('Updating…');
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
    'reading-dark': { ...full, heading: ARTICLE, body: 'Talks resume next year.', theme: 'dark', feed: 'The Verge' },
    'reading-light': { ...full, heading: ARTICLE, body: 'Talks resume next year.', theme: 'light', feed: 'The Verge' },
    'reading-no-lead-image': { ...full, heading: ARTICLE, body: 'Talks resume next year.', theme: 'dark', feed: 'The Verge' },
    'reading-long-feed-name': { ...full, heading: ARTICLE, body: 'Talks resume next year.', theme: 'light', feed: 'The Verge - Full RSS for subscribers | The Verge' },
    'reading-several-authors': {
      ...full,
      heading: ARTICLE,
      body: 'Talks resume next year.',
      byline: 'By Terrence O’Brien, Emma Roth and 2 others',
      theme: 'dark',
      feed: 'The Verge',
    },
    'reading-no-author': { ...full, heading: ARTICLE, body: 'Talks resume next year.', byline: null, theme: 'light', feed: 'The Verge' },
    'reading-omitted': { ...full, heading: ARTICLE, body: 'And how the prices compare:', omittedLines: 2, theme: 'dark', feed: 'The Verge' },
    'reading-missing': { ...full, heading: MISSING, body: null, titleSize: 24, openButton: false, byline: null, theme: 'dark', feed: null },
    'reading-extracting': { ...full, heading: CALM, body: SUBTITLE, note: BRINGING, byline: null, theme: 'dark', feed: 'Calm Notes' },
    'reading-unextracted': { ...fallback, theme: 'dark', feed: 'Calm Notes' },
    'reading-unextracted-no-image': { ...fallback, leadImage: false, theme: 'dark', feed: 'Calm Notes' },
    'reading-unextracted-light': { ...fallback, theme: 'light', feed: 'Calm Notes' },
    'reading-unextracted-largest-font': { ...fallback, titleSize: 60, theme: 'dark', feed: 'Calm Notes' },
    'reading-largest-font': { ...full, heading: ARTICLE, body: 'Talks resume next year.', titleSize: 60, theme: 'dark', feed: 'The Verge' },
        // Opening, before the Article arrives: only the headline the list had, ready for the page to fade in with (FEE-48, FEE-114).
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
    },
    // Its Feed is gone: the name stays, as plain text, with nowhere to link (T23).
  };


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
    // Save and Done are gone (FEE-95): the page offers only the Article and Open original.
    expect(screen.queryAllByRole('button', { name: /^(Save|Done)$/ })).toHaveLength(0);
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
    expect(await screen.findByRole('tab', { name: 'The Verge', selected: true })).toBeOnTheScreen();
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

  test.each(['/article/a1'])('signed out, %s opens sign-in instead', async (url) => {
    await open({ colorScheme: 'dark', auth: 'signed-out' }, url);
    expect(await screen.findByRole('heading', { name: 'feedSmith' })).toBeOnTheScreen();
    expect(screen.queryByText('Talks resume next year.')).not.toBeOnTheScreen();
    expect(screen.queryByLabelText('Website or feed URL')).not.toBeOnTheScreen();
  });
});

const ARTICLE_TITLE = FIXTURE_ARTICLE.title;

describe('Remove, from a Feed\'s chip (FEE-97, T23, Q32)', () => {
  const alerts = () => jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  type Buttons = Parameters<typeof Alert.alert>[2];
  const confirm = async (buttons: Buttons, text: 'Remove' | 'Cancel') =>
    // Cancel has no handler: Android just closes the dialog.
    act(async () => buttons!.find((button) => button.text === text)!.onPress?.());

  test('a long-press on a Feed\'s chip opens its menu, with Remove by name; All has none', async () => {
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', feeds: 'some', feed: 'f1' });
    expect(screen.queryByRole('menuitem')).not.toBeOnTheScreen();
    await user.longPress(await screen.findByRole('tab', { name: 'The Verge' }));
    expect(screen.getByRole('menuitem', { name: 'Remove The Verge' })).toBeOnTheScreen();
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
  });

  test('Remove asks first, saying its Articles go too; confirming removes it and shows All', async () => {
    const alert = alerts();
    const user = userEvent.setup();
    const w = await open({ colorScheme: 'dark', feeds: 'some', feed: 'f1' });
    await user.longPress(await screen.findByRole('tab', { name: 'The Verge' }));
    await user.press(screen.getByRole('menuitem', { name: 'Remove The Verge' }));
    expect(screen.queryByRole('menuitem')).not.toBeOnTheScreen();
    expect(w.feedsLog.removed).toEqual([]);
    const [title, message, buttons] = alert.mock.lastCall!;
    expect([title, message]).toEqual(['Remove The Verge?', 'Its Articles go too.']);
    expect(buttons!.find((button) => button.text === 'Remove')!.style).toBe('destructive');
    await confirm(buttons, 'Remove');
    expect(w.feedsLog.removed).toEqual(['f1']);
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('All');
    expect(screen.queryByRole('tab', { name: 'The Verge' })).not.toBeOnTheScreen();
    alert.mockRestore();
  });

  test('cancelling keeps the Feed and stays on its page', async () => {
    const alert = alerts();
    const user = userEvent.setup();
    const w = await open({ colorScheme: 'dark', feeds: 'some', feed: 'f1' });
    await user.longPress(await screen.findByRole('tab', { name: 'The Verge' }));
    await user.press(screen.getByRole('menuitem', { name: 'Remove The Verge' }));
    await confirm(alert.mock.lastCall![2], 'Cancel');
    expect(w.feedsLog.removed).toEqual([]);
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('The Verge');
    alert.mockRestore();
  });

  test('TalkBack\'s Remove action on a chip asks the same question', async () => {
    const alert = alerts();
    await open({ colorScheme: 'dark', feeds: 'some' });
    const chip = await screen.findByRole('tab', { name: 'Calm Notes' });
    await act(async () => chip.props.onAccessibilityAction({ nativeEvent: { actionName: 'remove' } }));
    expect(alert.mock.lastCall![0]).toBe('Remove Calm Notes?');
    alert.mockRestore();
  });

  test('a Feed with no Articles yet offers Remove there too (Q34)', async () => {
    const alert = alerts();
    const user = userEvent.setup();
    const w = await open({ colorScheme: 'dark', feeds: 'some', chips: 'many', feed: 'f4' });
    await user.press(await screen.findByRole('button', { name: 'Remove Farnam Street' }));
    await confirm(alert.mock.lastCall![2], 'Remove');
    expect(w.feedsLog.removed).toEqual(['f4']);
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('All');
    alert.mockRestore();
  });

  test("a remove that doesn't reach the server says so, and keeps the Feed (Q5)", async () => {
    const alert = alerts();
    const toast = jest.spyOn(ToastAndroid, 'show').mockImplementation(() => {});
    const user = userEvent.setup();
    const w = await open({ colorScheme: 'dark', feeds: 'some', feed: 'f1', removes: 'fail' });
    await user.longPress(await screen.findByRole('tab', { name: 'The Verge' }));
    await user.press(screen.getByRole('menuitem', { name: 'Remove The Verge' }));
    await confirm(alert.mock.lastCall![2], 'Remove');
    expect(toast).toHaveBeenCalledWith("Couldn't remove The Verge. Try again.", ToastAndroid.SHORT);
    expect(w.feedsLog.removed).toEqual([]);
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName('The Verge');
    alert.mockRestore();
    toast.mockRestore();
  });
});

describe('buttons have depth, not outlines (FEE-75, D27)', () => {
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

// FEE-48, kept by FEE-114: while the Article loads, the title the list already had is shown, so the page fades
// in with its headline, in the same headline that stays once the Article arrives.
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
    // The Article's arrived once its page offers Open original.
    expect(await screen.findByRole('button', { name: 'Open original' })).toBeOnTheScreen();
    expect(screen.getByRole('heading', { name: first.title })).toBe(before);
    world.dispose();
  });
});
