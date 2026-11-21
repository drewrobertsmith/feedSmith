import { act, fireEvent, userEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
import { Animated, ToastAndroid } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Uniwind } from 'uniwind';

import TabsLayout from '@/app/(tabs)/_layout';
import FeedsRoute from '@/app/(tabs)/index';
import SavedRoute from '@/app/(tabs)/saved';
import AddFeedRoute from '@/app/add-feed';
import ArticleRoute from '@/app/article/[id]';
import AuthReturnRoute from '@/app/auth';
import GalleryRoute from '@/app/gallery';
import SignInRoute from '@/app/sign-in';
import { publishedAgo } from '@/feeds/format';
import { AppRoot } from '@/navigation/app-root';
import {
  ADD_FEED_WORLDS,
  ALL_WORLDS,
  READING_WORLDS,
  type AddFeedWorldId,
  type AllWorldId,
  type ReadingWorldId,
} from '@/worlds/catalog';
import { FIXTURE_ARTICLE, FIXTURE_CHOICES, FIXTURE_NOW, FIXTURE_ROWS } from '@/worlds/fixtures';
import { createWorld, type World, type WorldSpec } from '@/worlds/world';

jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn() }));

function renderWorld(world: World, initialUrl: string = world.initialUrl) {
  return renderRouter(
    {
      _layout: () => <AppRoot environment={world.environment} auth={world.auth} feeds={world.feeds} />,
      '(tabs)/_layout': TabsLayout,
      '(tabs)/index': FeedsRoute,
      '(tabs)/saved': SavedRoute,
      'add-feed': AddFeedRoute,
      'article/[id]': ArticleRoute,
      'sign-in': SignInRoute,
      auth: AuthReturnRoute,
      gallery: GalleryRoute,
    },
    { initialUrl },
  );
}

/**
 * Legend List shows its rows once its scroll view and each row report a size, as they do at
 * once on a phone; Jest has no layout, so the test reports them.
 */
async function layOutAll() {
  const list = screen.queryByTestId('all-list');
  if (!list) return;
  const layout = (height: number) => ({ nativeEvent: { layout: { x: 0, y: 0, width: 412, height } } });
  await act(async () => fireEvent(list, 'layout', layout(915)));
  for (const row of screen.queryAllByRole('link')) {
    let node = row.parent;
    while (node && !node.props.onLayout) node = node.parent;
    if (node) await act(async () => fireEvent(node!, 'layout', layout(112)));
  }
}

let world: World | undefined;
const open = async (spec: WorldSpec, initialUrl?: string) => {
  world = createWorld(spec);
  await renderWorld(world, initialUrl);
  await layOutAll();
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
  };
  const ROWS = FIXTURE_ROWS.length;
  const READ = FIXTURE_ROWS.filter((r) => r.read).length;
  const VERGE_ROWS = FIXTURE_ROWS.filter((r) => r.feedId === 'f1').length;
  const SHOWS: Record<AllWorldId, Shows> = {
    'all-dark': { rows: ROWS, read: READ, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: 'All' },
    'all-light': { rows: ROWS, read: READ, empty: false, refreshing: false, theme: 'light', titleSize: 24, selected: 'All' },
    'all-read': { rows: ROWS, read: ROWS, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: 'All' },
    'all-empty': { rows: 0, read: 0, empty: true, refreshing: false, theme: 'dark', titleSize: 24, selected: '' },
    'all-loading': { rows: 0, read: 0, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: '' },
    'all-refreshing': { rows: ROWS, read: READ, empty: false, refreshing: true, theme: 'light', titleSize: 24, selected: 'All' },
    'all-largest-font': { rows: ROWS, read: READ, empty: false, refreshing: false, theme: 'dark', titleSize: 48, selected: 'All' },
    'all-feed': { rows: VERGE_ROWS, read: 1, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: 'The Verge, Pinned' },
    'all-feed-light': { rows: 1, read: 0, empty: false, refreshing: false, theme: 'light', titleSize: 24, selected: 'Calm Notes' },
    'all-feed-empty': { rows: 0, read: 0, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: 'Daring Fireball' },
    'all-remove-animations': { rows: ROWS, read: READ, empty: false, refreshing: false, theme: 'dark', titleSize: 24, selected: 'All' },
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
    if (shows.selected) expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(shows.selected);
    expect(Uniwind.currentTheme).toBe(shows.theme);
  });

  test('the chip row: All, the Pinned Feed, the rest, then + (P5, P9)', async () => {
    await open({ colorScheme: 'dark', feeds: 'some' });
    const tabs = await screen.findAllByRole('tab');
    const names = ['All', 'The Verge, Pinned', 'Calm Notes', 'Daring Fireball'];
    expect(tabs).toHaveLength(names.length);
    tabs.forEach((tab, i) => expect(tab).toHaveAccessibleName(names[i]));
    // The "+" chip replaces the tracer bullet's top-bar button: one way to add.
    expect(screen.getAllByRole('button', { name: 'Add a Feed' })).toHaveLength(1);
  });

  test("tapping a Feed's chip shows only its Articles; tapping All shows everything again", async () => {
    const user = userEvent.setup();
    await open({ colorScheme: 'dark', feeds: 'some' });
    await user.press(await screen.findByRole('tab', { name: 'Calm Notes' }));
    await layOutAll();
    expect(screen.getByRole('tab', { name: 'Calm Notes' })).toBeSelected();
    expect(screen.getAllByRole('link')).toHaveLength(1);
    await user.press(screen.getByRole('tab', { name: 'All' }));
    await layOutAll();
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
    let toast: jest.SpyInstance;
    beforeEach(() => {
      toast = jest.spyOn(ToastAndroid, 'show').mockImplementation(() => {});
    });
    afterEach(() => toast.mockRestore());

    test('long-pressing a Feed Pins it; long-pressing a Pinned Feed unpins it', async () => {
      const user = userEvent.setup();
      const w = await open({ colorScheme: 'dark', feeds: 'some' });
      await user.longPress(await screen.findByRole('tab', { name: 'Calm Notes' }));
      expect(w.feedsLog.pins).toEqual([{ id: 'f2', pinned: true }]);
      expect(toast).toHaveBeenLastCalledWith('Pinned Calm Notes.', ToastAndroid.SHORT);
      await user.longPress(screen.getByRole('tab', { name: 'The Verge, Pinned' }));
      expect(w.feedsLog.pins).toEqual([{ id: 'f2', pinned: true }, { id: 'f1', pinned: false }]);
      expect(toast).toHaveBeenLastCalledWith('Unpinned The Verge.', ToastAndroid.SHORT);
    });

    test('a fourth Pin is refused, saying why', async () => {
      const user = userEvent.setup();
      await open({ colorScheme: 'dark', feeds: 'some', pins: 'full' });
      await user.longPress(await screen.findByRole('tab', { name: 'Calm Notes' }));
      expect(toast).toHaveBeenLastCalledWith('You can Pin up to 3 Feeds. Unpin one first.', ToastAndroid.SHORT);
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
    expect(rows[0]).toHaveAccessibleName(`${first.title}, The Verge, ${publishedAgo(first.publishedAt, FIXTURE_NOW)}`);
    expect(rows[1]).toHaveAccessibleName(`${second.title}, The Verge, ${publishedAgo(second.publishedAt, FIXTURE_NOW)}, Read`);
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
  type Shows = { heading: string; body: string | null; omittedLines: number; titleSize: number; theme: 'dark' | 'light' };
  const ARTICLE = FIXTURE_ARTICLE.title;
  const MISSING = 'This Article isn’t available.';
  const SHOWS: Record<ReadingWorldId, Shows> = {
    'reading-dark': { heading: ARTICLE, body: 'Talks resume next year.', omittedLines: 0, titleSize: 24, theme: 'dark' },
    'reading-light': { heading: ARTICLE, body: 'Talks resume next year.', omittedLines: 0, titleSize: 24, theme: 'light' },
    'reading-omitted': { heading: ARTICLE, body: 'And how the prices compare:', omittedLines: 2, titleSize: 24, theme: 'dark' },
    'reading-missing': { heading: MISSING, body: null, omittedLines: 0, titleSize: 24, theme: 'dark' },
    'reading-largest-font': { heading: ARTICLE, body: 'Talks resume next year.', omittedLines: 0, titleSize: 48, theme: 'dark' },
  };

  test.each(READING_WORLDS)('$label', async ({ id, spec }) => {
    const shows = SHOWS[id];
    await open(spec);
    expect(await screen.findByRole('heading', { name: shows.heading })).toHaveStyle({ fontSize: shows.titleSize });
    if (shows.body) expect(screen.getByText(shows.body)).toBeOnTheScreen();
    expect(screen.queryAllByText(/isn’t shown here\./)).toHaveLength(shows.omittedLines);
    expect(Uniwind.currentTheme).toBe(shows.theme);
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
    await user.press(screen.getByRole('link', { name: 'Open original' }));
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
