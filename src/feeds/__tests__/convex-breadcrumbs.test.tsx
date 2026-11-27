import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ConvexFeeds } from '@/feeds/convex-feeds';
import {
  useAddFeed,
  useArticle,
  useMarkRead,
  useNewAddress,
  usePrefetchArticle,
  useRefresh,
  useRemoveFeed,
  useTryAgain,
} from '@/feeds/feeds-data';
import { trail } from '@/monitoring/trail';

/** The fake backend: every function answers from `mockAnswers` by name, or fails when the answer is an Error. */
let mockAnswers: Record<string, unknown> = {};
const answer = (name: string) => async () => {
  const value = mockAnswers[name];
  if (value instanceof Error) throw value;
  return value ?? null;
};

jest.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useConvexConnectionState: () => ({ isWebSocketConnected: true, hasEverConnected: true }),
  useQuery: () => undefined,
  useConvex: () => ({ watchQuery: () => ({ onUpdate: () => () => {} }) }),
  useMutation: (fn: { name: string }) => answer(fn.name),
  useAction: (fn: { name: string }) => answer(fn.name),
}));
jest.mock('../../../convex/_generated/api', () => ({
  api: new Proxy({}, { get: (_, module: string) => new Proxy({}, { get: (__, fn: string) => ({ name: `${module}:${fn}` }) }) }),
}));
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ deletion: 'idle' }) }));
jest.mock('@/monitoring/trail', () => ({ trail: jest.fn() }));

const trailed = jest.mocked(trail);
const wrapper = ({ children }: { children: ReactNode }) => <ConvexFeeds>{children}</ConvexFeeds>;

beforeEach(() => {
  mockAnswers = {};
  trailed.mockClear();
});

// FEE-137 (T50): the steps before a crash show in its report, as ids and outcomes.
describe('Articles', () => {
  test('a prefetched Article', async () => {
    jest.useFakeTimers();
    const { result } = await renderHook(() => usePrefetchArticle(), { wrapper });
    await act(async () => result.current('a1'));
    jest.useRealTimers();
    expect(trailed).toHaveBeenCalledWith('article.prefetched', { articleId: 'a1' });
  });

  test('an opened Article, once while it stays open', async () => {
    const { rerender } = await renderHook(({ id }: { id: string }) => useArticle(id), { wrapper, initialProps: { id: 'a1' } });
    await rerender({ id: 'a1' });
    expect(trailed.mock.calls).toEqual([['article.opened', { articleId: 'a1' }]]);
    await rerender({ id: 'a2' });
    expect(trailed).toHaveBeenLastCalledWith('article.opened', { articleId: 'a2' });
  });

  test('an Article marked read', async () => {
    const { result } = await renderHook(() => useMarkRead(), { wrapper });
    await act(async () => result.current('a1'));
    expect(trailed).toHaveBeenCalledWith('article.read', { articleId: 'a1' });
  });
});

describe('Feeds', () => {
  test.each([
    ['added', { ok: true, feedId: 'f1' }, { outcome: 'added', feedId: 'f1' }],
    ['already followed', { ok: false, reason: 'already-added', title: 'The Verge', feedId: 'f1' }, { outcome: 'already', feedId: 'f1' }],
    ['a choice', { ok: false, reason: 'choose', choices: [] }, { outcome: 'choose' }],
    ['refused', { ok: false, reason: 'not-a-feed' }, { outcome: 'failed' }],
    ['unreachable', new Error('offline'), { outcome: 'failed' }],
  ])('adding a Feed: %s', async (_, response, details) => {
    mockAnswers = { 'feeds:add': response };
    const { result } = await renderHook(() => useAddFeed(), { wrapper });
    await act(async () => {
      await result.current.add('theverge.com');
    });
    expect(trailed.mock.calls).toEqual([['feed.added', details]]);
  });

  test('text that isn’t an address never reaches the server, so leaves no breadcrumb', async () => {
    const { result } = await renderHook(() => useAddFeed(), { wrapper });
    await act(async () => {
      await result.current.add('the verge');
    });
    expect(trailed).not.toHaveBeenCalled();
  });

  test.each([
    ['ok', { ok: true, feedId: 'f1' }, { outcome: 'added', feedId: 'f1' }],
    ['failed', new Error('offline'), { outcome: 'failed', feedId: 'f1' }],
  ])('a New address: %s', async (_, response, details) => {
    mockAnswers = { 'feeds:newAddress': response };
    const { result } = await renderHook(() => useNewAddress('f1'), { wrapper });
    await act(async () => {
      await result.current.add('theverge.com');
    });
    expect(trailed.mock.calls).toEqual([['feed.new-address', details]]);
  });

  test.each([
    ['ok', true, 'ok'],
    ['failed', new Error('offline'), 'failed'],
  ])('removing a Feed: %s', async (_, response, outcome) => {
    mockAnswers = { 'feeds:remove': response };
    const { result } = await renderHook(() => useRemoveFeed(), { wrapper });
    await act(async () => {
      await result.current('f1');
    });
    expect(trailed.mock.calls).toEqual([['feed.removed', { feedId: 'f1', outcome }]]);
  });

  test.each([
    ['ok', null, 'ok'],
    ['failed', new Error('offline'), 'failed'],
  ])('Try again: %s', async (_, response, outcome) => {
    mockAnswers = { 'feeds:tryAgain': response };
    const { result } = await renderHook(() => useTryAgain('f1'), { wrapper });
    await act(async () => {
      result.current.tryAgain();
    });
    expect(trailed.mock.calls).toEqual([['feed.try-again', { feedId: 'f1', outcome }]]);
  });

  test.each([
    ['ok', 1795788000000, 'ok'],
    ['failed', new Error('offline'), 'failed'],
  ])('a refresh: %s', async (_, response, outcome) => {
    mockAnswers = { 'feeds:refreshAll': response };
    const { result } = await renderHook(() => useRefresh(), { wrapper });
    await act(async () => {
      await result.current.refresh();
    });
    expect(trailed.mock.calls).toEqual([['feeds.refreshed', { outcome }]]);
  });
});
