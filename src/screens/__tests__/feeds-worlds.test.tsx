import { act, userEvent } from '@testing-library/react-native';
import { renderRouter, screen } from 'expo-router/testing-library';
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
import { publishedDate } from '@/feeds/format';
import { AppRoot } from '@/navigation/app-root';
import {
  ADD_FEED_WORLDS,
  ALL_WORLDS,
  READING_WORLDS,
  type AddFeedWorldId,
  type AllWorldId,
  type ReadingWorldId,
} from '@/worlds/catalog';
import { FIXTURE_ARTICLE, FIXTURE_ROWS } from '@/worlds/fixtures';
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

let world: World | undefined;
const open = async (spec: WorldSpec, initialUrl?: string) => {
  world = createWorld(spec);
  await renderWorld(world, initialUrl);
  return world;
};
afterEach(() => {
  world?.dispose();
  world = undefined;
  jest.mocked(WebBrowser.openBrowserAsync).mockClear();
});

describe('All', () => {
  type Shows = { rows: number; empty: boolean; refreshing: boolean; theme: 'dark' | 'light'; titleSize: number };
  const SHOWS: Record<AllWorldId, Shows> = {
    'all-dark': { rows: FIXTURE_ROWS.length, empty: false, refreshing: false, theme: 'dark', titleSize: 24 },
    'all-light': { rows: FIXTURE_ROWS.length, empty: false, refreshing: false, theme: 'light', titleSize: 24 },
    'all-empty': { rows: 0, empty: true, refreshing: false, theme: 'dark', titleSize: 24 },
    'all-loading': { rows: 0, empty: false, refreshing: false, theme: 'dark', titleSize: 24 },
    'all-refreshing': { rows: FIXTURE_ROWS.length, empty: false, refreshing: true, theme: 'light', titleSize: 24 },
    'all-largest-font': { rows: FIXTURE_ROWS.length, empty: false, refreshing: false, theme: 'dark', titleSize: 48 },
  };

  test.each(ALL_WORLDS)('$label', async ({ id, spec }) => {
    const shows = SHOWS[id];
    await open(spec);
    expect(await screen.findByRole('heading', { name: 'Feeds' })).toHaveStyle({ fontSize: shows.titleSize });
    expect(screen.queryAllByRole('link')).toHaveLength(shows.rows);
    if (shows.empty) {
      expect(screen.getByText('Add a Feed to see its Articles here.')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Add a Feed' })).toBeEnabled();
    } else {
      expect(screen.queryByText('Add a Feed to see its Articles here.')).not.toBeOnTheScreen();
    }
    if (!shows.empty && shows.rows > 0) {
      expect(screen.getByTestId('all-list').props.refreshControl.props.refreshing).toBe(shows.refreshing);
    }
    expect(Uniwind.currentTheme).toBe(shows.theme);
  });

  test('pulling down asks every Feed to refresh, from the server (Q21)', async () => {
    const w = await open({ colorScheme: 'dark', feeds: 'some' });
    const list = await screen.findByTestId('all-list');
    await act(() => list.props.refreshControl.props.onRefresh());
    expect(w.feedsLog.refreshes).toBe(1);
  });

  test('each Article reads its title, Feed and date to TalkBack, newest first (Q15)', async () => {
    await open({ colorScheme: 'dark', feeds: 'some' });
    const rows = await screen.findAllByRole('link');
    const [first] = FIXTURE_ROWS;
    expect(rows[0]).toHaveAccessibleName(`${first.title}, The Verge, ${publishedDate(first.publishedAt)}`);
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
    unreachable: 'Couldn’t reach that address. Check the URL and your connection, then try again.',
    'invalid-url': 'Enter a feed URL that starts with https://.',
  };
  type Shows = { busy: boolean; error: string | null; titleSize: number; theme: 'dark' | 'light' };
  const SHOWS: Record<AddFeedWorldId, Shows> = {
    'add-idle': { busy: false, error: null, titleSize: 24, theme: 'dark' },
    'add-busy': { busy: true, error: null, titleSize: 24, theme: 'dark' },
    'add-not-a-feed': { busy: false, error: ERRORS['not-a-feed'], titleSize: 24, theme: 'dark' },
    'add-unreachable': { busy: false, error: ERRORS.unreachable, titleSize: 24, theme: 'light' },
    'add-largest-font': { busy: false, error: ERRORS['invalid-url'], titleSize: 48, theme: 'dark' },
  };

  test.each(ADD_FEED_WORLDS)('$label', async ({ id, spec }) => {
    const shows = SHOWS[id];
    await open(spec);
    expect(await screen.findByRole('heading', { name: 'Add a Feed' })).toHaveStyle({ fontSize: shows.titleSize });
    const field = screen.getByLabelText('Feed URL');
    if (shows.busy) {
      expect(screen.getByRole('button', { name: 'Adding…' })).toBeDisabled();
      expect(field).toHaveProp('editable', false);
    } else {
      expect(screen.getByRole('button', { name: 'Add Feed' })).toBeOnTheScreen();
    }
    if (shows.error) expect(screen.getByRole('alert')).toHaveTextContent(shows.error);
    else expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    expect(Uniwind.currentTheme).toBe(shows.theme);
  });

  test('Add Feed waits for a URL', async () => {
    await open({ colorScheme: 'dark', section: 'add-feed' });
    expect(await screen.findByRole('button', { name: 'Add Feed' })).toBeDisabled();
  });

  test('adding a Feed sends the URL and returns to All', async () => {
    const user = userEvent.setup();
    const w = await open({ colorScheme: 'dark', feeds: 'some' });
    await user.press(await screen.findByRole('button', { name: 'Add a Feed' }));
    await user.type(await screen.findByLabelText('Feed URL'), 'https://www.theverge.com/rss/index.xml');
    await user.press(screen.getByRole('button', { name: 'Add Feed' }));
    expect(w.feedsLog.added).toEqual(['https://www.theverge.com/rss/index.xml']);
    expect(await screen.findByRole('heading', { name: 'Feeds' })).toBeOnTheScreen();
  });

  test('a failed add stays on the screen with the URL kept', async () => {
    const user = userEvent.setup();
    const w = await open({ colorScheme: 'dark', section: 'add-feed', addFeed: 'not-a-feed' });
    await user.type(await screen.findByLabelText('Feed URL'), 'https://example.com/');
    await user.press(screen.getByRole('button', { name: 'Add Feed' }));
    expect(w.feedsLog.added).toEqual(['https://example.com/']);
    expect(screen.getByRole('heading', { name: 'Add a Feed' })).toBeOnTheScreen();
    expect(screen.getByLabelText('Feed URL')).toHaveDisplayValue('https://example.com/');
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
    expect(screen.queryByLabelText('Feed URL')).not.toBeOnTheScreen();
  });
});

const ARTICLE_TITLE = FIXTURE_ARTICLE.title;
