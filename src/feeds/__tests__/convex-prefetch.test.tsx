import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ConvexFeeds } from '@/feeds/convex-feeds';
import { usePrefetchArticle } from '@/feeds/feeds-data';
import { trail } from '@/monitoring/trail';

/** Convex's watches, counted: each `onUpdate` is one watch, and its `stop` lets that watch go. */
const mockWatches: { id: string; stopped: number }[] = [];
let mockSession = { isAuthenticated: true, isLoading: false };

jest.mock('convex/react', () => ({
  useConvexAuth: () => mockSession,
  useConvexConnectionState: () => ({ isWebSocketConnected: true, hasEverConnected: true }),
  useQuery: () => undefined,
  useMutation: () => async () => null,
  useAction: () => async () => null,
  useConvex: () => ({
    watchQuery: (_: unknown, { id }: { id: string }) => ({
      onUpdate: () => {
        const watch = { id, stopped: 0 };
        mockWatches.push(watch);
        return () => {
          watch.stopped += 1;
        };
      },
    }),
  }),
}));
jest.mock('../../../convex/_generated/api', () => ({
  api: new Proxy({}, { get: (_, module: string) => new Proxy({}, { get: (__, fn: string) => `${module}:${fn}` }) }),
}));
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ deletion: 'idle' }) }));
jest.mock('@/monitoring/trail', () => ({ trail: jest.fn() }));

const wrapper = ({ children }: { children: ReactNode }) => <ConvexFeeds>{children}</ConvexFeeds>;

beforeEach(() => {
  jest.useFakeTimers();
  mockWatches.length = 0;
  mockSession = { isAuthenticated: true, isLoading: false };
  jest.mocked(trail).mockClear();
});
afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

async function prefetch() {
  const hook = await renderHook(() => usePrefetchArticle(), { wrapper });
  return { touch: (id: string) => act(async () => hook.result.current(id)), hook };
}

// FEE-143: a second touch of the same Article within five seconds made a second watch of the same query, and
// letting both go crashed Convex (FEEDSMITH-X). Each Article is held at most once.
describe('prefetching an Article from a touched row', () => {
  test('two touches of the same Article make one watch, let go once, five seconds after the second touch', async () => {
    const { touch } = await prefetch();
    await touch('a1');
    await act(async () => jest.advanceTimersByTime(4000));
    await touch('a1');

    expect(mockWatches).toEqual([{ id: 'a1', stopped: 0 }]);
    // Five seconds after the first touch: still held, since the second restarted the clock.
    await act(async () => jest.advanceTimersByTime(1500));
    expect(mockWatches[0].stopped).toBe(0);
    await act(async () => jest.advanceTimersByTime(3500));
    expect(mockWatches).toEqual([{ id: 'a1', stopped: 1 }]);
  });

  test('two different Articles make two watches, each let go after its own five seconds', async () => {
    const { touch } = await prefetch();
    await touch('a1');
    await act(async () => jest.advanceTimersByTime(2000));
    await touch('a2');

    await act(async () => jest.advanceTimersByTime(3000));
    expect(mockWatches).toEqual([
      { id: 'a1', stopped: 1 },
      { id: 'a2', stopped: 0 },
    ]);
    await act(async () => jest.advanceTimersByTime(2000));
    expect(mockWatches[1].stopped).toBe(1);
  });

  test('an Article let go is watched again on its next touch', async () => {
    const { touch } = await prefetch();
    await touch('a1');
    await act(async () => jest.advanceTimersByTime(5000));
    await touch('a1');
    expect(mockWatches).toEqual([
      { id: 'a1', stopped: 1 },
      { id: 'a1', stopped: 0 },
    ]);
  });

  test('every touch still leaves its breadcrumb', async () => {
    const { touch } = await prefetch();
    await touch('a1');
    await touch('a1');
    expect(jest.mocked(trail).mock.calls).toEqual([
      ['article.prefetched', { articleId: 'a1' }],
      ['article.prefetched', { articleId: 'a1' }],
    ]);
  });

  test('signing out lets every held Article go at once', async () => {
    const { touch, hook } = await prefetch();
    await touch('a1');
    await touch('a2');
    mockSession = { isAuthenticated: false, isLoading: false };
    await hook.rerender({});
    expect(mockWatches.map((w) => w.stopped)).toEqual([1, 1]);
    // And their timers don't let them go a second time.
    await act(async () => jest.advanceTimersByTime(10_000));
    expect(mockWatches.map((w) => w.stopped)).toEqual([1, 1]);
  });
});
