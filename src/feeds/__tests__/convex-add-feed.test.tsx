import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ConvexFeeds } from '@/feeds/convex-feeds';
import { useAddFeed } from '@/feeds/feeds-data';

/** The fake backend: `feeds.add` answers from `mockAnswers` by URL, else adds; any other function used is recorded. */
const mockAdded: string[] = [];
const mockOtherCalls: string[] = [];
let mockAnswers: Record<string, unknown> = {};

jest.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  // Any query or other action the hook so much as sets up is recorded: Add a Feed needs only `feeds.add`.
  useQuery: (query: unknown) => {
    mockOtherCalls.push(String(query));
    return undefined;
  },
  useMutation: () => Object.assign(async () => null, { withOptimisticUpdate: () => async () => null }),
  useAction: (fn: unknown) => {
    if (String(fn) !== 'feeds:add') {
      mockOtherCalls.push(String(fn));
      return async () => null;
    }
    return async ({ url }: { url: string }) => {
      mockAdded.push(url);
      return mockAnswers[url] ?? { ok: true, feedId: 'feed-new' };
    };
  },
}));
jest.mock('../../../convex/_generated/api', () => ({
  api: new Proxy({}, { get: (_, module: string) => new Proxy({}, { get: (__, fn: string) => ({ name: fn, toString: () => `${module}:${fn}` }) }) }),
}));
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ deletion: 'idle' }) }));

const wrapper = ({ children }: { children: ReactNode }) => <ConvexFeeds>{children}</ConvexFeeds>;

beforeEach(() => {
  mockAdded.length = 0;
  mockOtherCalls.length = 0;
  mockAnswers = {};
});

test.each(['the verge', ' theverge ', 'bits about money'])(
  'text that isn’t an address (“%s”) is the invalid-address error, and nothing reaches the server (FEE-96)',
  async (typed) => {
    const { result } = await renderHook(() => useAddFeed(), { wrapper });
    await act(async () => {
      expect(await result.current.add(typed)).toEqual({ kind: 'stay' });
    });
    expect(result.current.view).toEqual({ status: 'error', reason: 'invalid-url' });
    expect(mockAdded).toEqual([]);
    expect(mockOtherCalls).toEqual([]);
  },
);

test('an address with one feed is added, naming the new Feed so its chip can open (FEE-45)', async () => {
  const { result } = await renderHook(() => useAddFeed(), { wrapper });
  await act(async () => {
    expect(await result.current.add('theverge.com')).toEqual({ kind: 'added', feedId: 'feed-new' });
  });
  expect(mockAdded).toEqual(['theverge.com']);
  expect(result.current.view).toEqual({ status: 'idle' });
});

test('an address with several feeds offers the choice (T21)', async () => {
  const choices = [
    { url: 'https://www.bitsaboutmoney.com/archive/rss/', title: 'Bits about Money' },
    { url: 'https://www.bitsaboutmoney.com/podcast/rss/', title: 'Complex Systems' },
  ];
  mockAnswers = { 'bitsaboutmoney.com': { ok: false, reason: 'choose', choices } };
  const { result } = await renderHook(() => useAddFeed(), { wrapper });
  await act(async () => {
    expect(await result.current.add('bitsaboutmoney.com')).toEqual({ kind: 'stay' });
  });
  expect(result.current.view).toEqual({ status: 'choose', choices });
});

test('an address already followed names that Feed (T22)', async () => {
  mockAnswers = { 'theverge.com': { ok: false, reason: 'already-added', title: 'The Verge', feedId: 'f1' } };
  const { result } = await renderHook(() => useAddFeed(), { wrapper });
  await act(async () => {
    expect(await result.current.add('theverge.com')).toEqual({ kind: 'already', title: 'The Verge', feedId: 'f1' });
  });
});

test('the app never calls the catalog’s search, guessing or remembering (FEE-96)', async () => {
  const { result } = await renderHook(() => useAddFeed(), { wrapper });
  await act(async () => {
    await result.current.add('theverge.com');
  });
  expect(mockOtherCalls).toEqual([]);
});
