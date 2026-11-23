import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { ConvexFeeds } from '@/feeds/convex-feeds';
import { useAddFeed } from '@/feeds/feeds-data';

/** The fake backend: each `find` waits until the test answers it; `search` answers from `mockCatalog`. */
const mockFinds: { name: string; resolve: (value: { found: string[] }) => void; reject: (error: Error) => void }[] = [];
const mockAdded: string[] = [];
let mockCatalog: Record<string, { kind: 'new'; url: string; title: string; host: string }[]> = {};

jest.mock('convex/react', () => ({
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useQuery: (_query: unknown, args: { name: string } | 'skip') => (args === 'skip' ? undefined : mockCatalog[args.name]),
  useMutation: () => Object.assign(async () => null, { withOptimisticUpdate: () => async () => null }),
  useAction: (fn: { name?: string }) => {
    if (String(fn) === 'catalog:find' || fn.name === 'find')
      return ({ name }: { name: string }) => new Promise((resolve, reject) => mockFinds.push({ name, resolve, reject }));
    return async ({ url }: { url: string }) => {
      mockAdded.push(url);
      return { ok: true };
    };
  },
}));
jest.mock('../../../convex/_generated/api', () => ({
  api: new Proxy({}, { get: (_, module: string) => new Proxy({}, { get: (__, fn: string) => ({ name: fn, toString: () => `${module}:${fn}` }) }) }),
}));
jest.mock('@/auth/auth-context', () => ({ useAuth: () => ({ deletion: 'idle' }) }));

const wrapper = ({ children }: { children: ReactNode }) => <ConvexFeeds>{children}</ConvexFeeds>;
const VERGE = { kind: 'new' as const, url: 'https://www.theverge.com/rss/index.xml', title: 'The Verge', host: 'theverge.com' };

beforeEach(() => {
  mockFinds.length = 0;
  mockAdded.length = 0;
  mockCatalog = {};
});

test('a name searches, showing what the mockCatalog knows while guessing goes on, then done', async () => {
  mockCatalog = { 'the verge': [VERGE] };
  const { result } = await renderHook(() => useAddFeed(), { wrapper });
  await act(async () => {
    expect(await result.current.add(' the verge ')).toEqual({ kind: 'stay' });
  });
  expect(mockFinds.map((find) => find.name)).toEqual(['the verge']);
  expect(mockAdded).toEqual([]);
  expect(result.current.view).toEqual({ status: 'found', name: 'the verge', results: [VERGE], searching: true, failed: false });
  await act(async () => mockFinds[0].resolve({ found: [] }));
  expect(result.current.view).toMatchObject({ results: [VERGE], searching: false, failed: false });
});

test('an address is mockAdded as today, with no search', async () => {
  const { result } = await renderHook(() => useAddFeed(), { wrapper });
  await act(async () => {
    expect(await result.current.add('theverge.com')).toEqual({ kind: 'added' });
  });
  expect(mockAdded).toEqual(['theverge.com']);
  expect(mockFinds).toEqual([]);
});

test('a search that fails says so', async () => {
  const { result } = await renderHook(() => useAddFeed(), { wrapper });
  await act(async () => {
    await result.current.add('the verge');
  });
  await act(async () => mockFinds[0].reject(new Error('offline')));
  expect(result.current.view).toMatchObject({ status: 'found', searching: false, failed: true, results: [] });
});

test('an older search’s answer never changes a newer search (Q20)', async () => {
  mockCatalog = { 'the verge': [VERGE], 'daring fireball': [] };
  const { result } = await renderHook(() => useAddFeed(), { wrapper });
  await act(async () => {
    await result.current.add('the verge');
  });
  await act(async () => {
    await result.current.add('daring fireball');
  });
  await act(async () => mockFinds[0].reject(new Error('late')));
  expect(result.current.view).toMatchObject({ name: 'daring fireball', searching: true, failed: false, results: [] });
});
