import { act, userEvent, waitFor } from '@testing-library/react-native';
import { screen } from 'expo-router/testing-library';

import * as articleOrigin from '@/navigation/article-origin';
import { FIXTURE_ROWS } from '@/worlds/fixtures';
import { createWorld, type World, type WorldSpec } from '@/worlds/world';
import { layOutList, renderWorld } from '../../../test/world-router';

/** Android's back gesture, as the native module would send it (FEE-114). */
const mockBack = { listeners: new Set<(event: unknown) => void>(), enabled: false };
jest.mock('../../../modules/predictive-back/src/PredictiveBackModule', () => ({
  __esModule: true,
  default: {
    addListener: (_name: string, listener: (event: unknown) => void) => {
      mockBack.listeners.add(listener);
      return { remove: () => mockBack.listeners.delete(listener) };
    },
    setEnabled: async (enabled: boolean) => {
      mockBack.enabled = enabled;
    },
  },
}));
const sendBack = (type: 'started' | 'progress' | 'cancelled' | 'invoked', progress = 0) =>
  act(async () => mockBack.listeners.forEach((listener) => listener({ type, progress, edge: 'left' })));

const [first] = FIXTURE_ROWS;
const ROW = { x: 0, y: 200, width: 412, height: 120 };

let world: World | undefined;
const open = async (spec: WorldSpec) => {
  world = createWorld(spec);
  await renderWorld(world);
  await layOutList('all-list');
  return world;
};
afterEach(() => {
  jest.useRealTimers();
  world?.dispose();
  world = undefined;
  articleOrigin.clearOrigin(first.id);
  jest.restoreAllMocks();
});

/** Jest has no layout, so the row says where it is, as it would on a phone. */
const placeRow = () => articleOrigin.registerRow(first.id, () => ({ row: ROW }));
// Hidden from TalkBack, so the query has to ask for hidden elements.
const openingRow = () => screen.queryByTestId('opening-row', { includeHiddenElements: true });

// FEE-114: opening an Article grows its row into the page, Material's container transform, and Back shrinks
// the page back into the row.
describe('opening an Article grows it from its row (FEE-114)', () => {
  test('tapping a row notes where it was, for the page to grow from', async () => {
    const record = jest.spyOn(articleOrigin, 'recordOrigin');
    await open({ colorScheme: 'dark', feeds: 'some' });
    await userEvent.setup().press(screen.getAllByRole('link')[0]);
    expect(record).toHaveBeenCalledWith(first, true);
  });

  test('touching a row starts loading its Article, so its page is ready to grow into', async () => {
    const w = await open({ colorScheme: 'dark', feeds: 'some' });
    await userEvent.setup().press(screen.getAllByRole('link')[0]);
    expect(w.feedsLog.prefetched).toEqual([first.id]);
  });

  test('with Remove animations on, nothing is noted: the page just appears (Q17)', async () => {
    const record = jest.spyOn(articleOrigin, 'recordOrigin');
    await open({ colorScheme: 'dark', feeds: 'some', reduceMotion: true });
    await userEvent.setup().press(screen.getAllByRole('link')[0]);
    expect(record).not.toHaveBeenCalled();
    expect(openingRow()).not.toBeOnTheScreen();
  });

  test('the row it grows from is a copy TalkBack passes over, and it gives way to the page', async () => {
    // Fake timers hold the move at its start (Reanimated finishes at once on real ones).
    jest.useFakeTimers();
    const unplace = placeRow();
    articleOrigin.recordOrigin(first, true);
    await open({ colorScheme: 'dark', section: 'article' });
    const copy = openingRow();
    expect(copy).toBeOnTheScreen();
    expect(copy).toHaveProp('importantForAccessibility', 'no-hide-descendants');
    // TalkBack hears one headline: the page's.
    expect(screen.getAllByRole('heading', { name: first.title })).toHaveLength(1);
    // Jest can't measure the lead image, so opening first waits out its lead wait, then moves.
    await act(async () => jest.advanceTimersByTime(200));
    await act(async () => jest.advanceTimersByTime(1000));
    expect(openingRow()).not.toBeOnTheScreen();
    unplace();
  });

  test('opened from a link, with no row behind it, there is no row to grow from', async () => {
    await open({ colorScheme: 'dark', section: 'article' });
    expect(await screen.findByRole('heading', { name: first.title })).toBeOnTheScreen();
    expect(openingRow()).not.toBeOnTheScreen();
  });

  test('with Remove animations on, a row noted earlier is not grown from (Q17)', async () => {
    const unplace = placeRow();
    articleOrigin.recordOrigin(first, true);
    await open({ colorScheme: 'dark', section: 'article', reduceMotion: true });
    expect(await screen.findByRole('heading', { name: first.title })).toBeOnTheScreen();
    expect(openingRow()).not.toBeOnTheScreen();
    unplace();
  });

});

describe('Back follows Android’s predictive back gesture (FEE-114)', () => {
  /** Opens the first row's Article from All, and waits until the page is fully open. */
  const openFromRow = async () => {
    await open({ colorScheme: 'dark', feeds: 'some' });
    await userEvent.setup().press(screen.getAllByRole('link')[0]);
    expect(await screen.findByRole('heading', { name: first.title })).toBeOnTheScreen();
    await waitFor(() => expect(mockBack.enabled).toBe(true), { timeout: 2000 });
  };

  test('once the page is open, the gesture comes to it, not the navigator', async () => {
    await openFromRow();
    expect(mockBack.listeners.size).toBe(1);
  });

  test('a cancelled gesture leaves the Article open', async () => {
    await openFromRow();
    await sendBack('started');
    await sendBack('progress', 0.6);
    await sendBack('cancelled');
    expect(screen.getByRole('heading', { name: first.title })).toBeOnTheScreen();
  });

  test('a committed gesture closes the Article, back to the list, and hands back to the navigator', async () => {
    await openFromRow();
    await sendBack('started');
    await sendBack('progress', 0.8);
    await sendBack('invoked');
    await waitFor(() => expect(screen.queryByRole('heading', { name: first.title })).not.toBeOnTheScreen(), {
      timeout: 2000,
    });
    expect(screen.getByTestId('all-list')).toBeOnTheScreen();
    expect(mockBack.enabled).toBe(false);
    // Where it was opened from is forgotten with it (Q20).
    expect(articleOrigin.getOrigin(first.id)).toBeUndefined();
  });

  test('with Remove animations on, back stays the navigator’s (Q17)', async () => {
    await open({ colorScheme: 'dark', feeds: 'some', reduceMotion: true });
    await userEvent.setup().press(screen.getAllByRole('link')[0]);
    expect(await screen.findByRole('heading', { name: first.title })).toBeOnTheScreen();
    expect(mockBack.enabled).toBe(false);
  });
});

// FEE-115: every way out of an Article moves; the Feed link and "Back to All" leave on the axis, then go.
describe('leaving an Article by its Feed link or Back to All (FEE-115)', () => {
  const feedLink = () => screen.findByRole('link', { name: 'The Verge, open its Articles' });
  const headline = () => screen.queryByRole('heading', { name: first.title });

  test('the Feed link closes the page first, then the list shows that Feed chosen', async () => {
    world = createWorld({ colorScheme: 'dark', feeds: 'some' });
    await renderWorld(world, `/article/${first.id}`);
    await userEvent.setup().press(await feedLink());
    // Still leaving: the page goes before the list changes, so they never move at once.
    expect(headline()).toBeOnTheScreen();
    expect(await screen.findByRole('tab', { name: 'The Verge', selected: true })).toBeOnTheScreen();
    expect(headline()).not.toBeOnTheScreen();
  });

  test('with Remove animations on, the Feed link leaves at once (Q17)', async () => {
    world = createWorld({ colorScheme: 'dark', feeds: 'some', reduceMotion: true });
    await renderWorld(world, `/article/${first.id}`);
    await userEvent.setup().press(await feedLink());
    expect(headline()).not.toBeOnTheScreen();
    expect(await screen.findByRole('tab', { name: 'The Verge', selected: true })).toBeOnTheScreen();
  });

  test('Back to All from a missing Article closes the page, then lands on All', async () => {
    world = createWorld({ colorScheme: 'dark', feeds: 'some', section: 'article', article: 'missing' });
    await renderWorld(world);
    await userEvent.setup().press(await screen.findByRole('button', { name: 'Back to All' }));
    expect(screen.getByRole('button', { name: 'Back to All' })).toBeOnTheScreen();
    expect(await screen.findByRole('tab', { name: 'All', selected: true })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Back to All' })).not.toBeOnTheScreen();
  });
});
