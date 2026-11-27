import { act, render } from '@testing-library/react-native';

import { useAuth, type Auth } from '@/auth/auth-context';
import { ConvexAuth } from '@/auth/convex-auth';
import { identify } from '@/monitoring/identify';
import { trail } from '@/monitoring/trail';

/** The fake session: what Convex Auth says, what `users.viewer` answers, and how the server calls go. */
let mockSession = { isLoading: false, isAuthenticated: true };
let mockViewer: unknown = { id: 'u1', email: 'ada@example.com', initial: 'A' };
let mockDelete: () => Promise<unknown> = async () => null;
let mockSignIn: () => Promise<unknown> = async () => ({ status: 'complete' });
const mockSignOut = jest.fn(async () => {});

jest.mock('convex/react', () => ({
  ConvexReactClient: class {},
  useConvexAuth: () => mockSession,
  useQuery: (_: unknown, args: unknown) => (args === 'skip' ? undefined : mockViewer),
  useMutation: () => () => mockDelete(),
}));
jest.mock('@convex-dev/auth/react', () => ({
  ConvexAuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuthActions: () => ({ signOut: mockSignOut }),
}));
jest.mock('@convex-dev/auth/methods/google/react', () => ({ useSignInWithGoogle: () => ({ signIn: () => mockSignIn() }) }));
jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-web-browser', () => ({}));
jest.mock('../../../convex/_generated/api', () => ({
  api: new Proxy({}, { get: (_, module: string) => new Proxy({}, { get: (__, fn: string) => `${module}:${fn}` }) }),
}));
jest.mock('@/monitoring/identify', () => ({ identify: jest.fn() }));
jest.mock('@/monitoring/trail', () => ({ trail: jest.fn() }));

const identified = jest.mocked(identify);
const trailed = jest.mocked(trail);

let auth: Auth;
const seeAuth = (seen: Auth) => {
  auth = seen;
};
function Probe({ onAuth }: { onAuth: (seen: Auth) => void }) {
  onAuth(useAuth());
  return null;
}
const app = () => (
  <ConvexAuth>
    <Probe onAuth={seeAuth} />
  </ConvexAuth>
);
const show = () => render(app());

beforeEach(() => {
  mockSession = { isLoading: false, isAuthenticated: true };
  mockViewer = { id: 'u1', email: 'ada@example.com', initial: 'A' };
  mockDelete = async () => null;
  mockSignIn = async () => ({ status: 'complete' });
  identified.mockClear();
  trailed.mockClear();
});

// FEE-138 (T50): crash reports name the User by their opaque id while signed in, and no one otherwise.
describe('who crash reports name', () => {
  test('a signed-in User, by the id the server gives', async () => {
    await show();
    expect(identified).toHaveBeenLastCalledWith('u1');
  });

  test('no one, once signed out', async () => {
    const { rerender } = await show();
    mockSession = { isLoading: false, isAuthenticated: false };
    await rerender(app());
    expect(identified).toHaveBeenLastCalledWith(null);
  });

  test('no one yet while the session is still loading, and no one cleared either', async () => {
    mockSession = { isLoading: true, isAuthenticated: false };
    await show();
    expect(identified).not.toHaveBeenCalled();
  });

  test('no one, once the Account is deleted', async () => {
    await show();
    await act(() => auth.deleteAccount());
    expect(identified).toHaveBeenLastCalledWith(null);
  });

  test('still the User when deleting the Account fails', async () => {
    mockDelete = async () => {
      throw new Error('offline');
    };
    await show();
    await act(() => auth.deleteAccount());
    expect(identified).not.toHaveBeenCalledWith(null);
  });
});

// FEE-138: sign-in, sign-out and Account deletion leave breadcrumbs.
describe('auth breadcrumbs', () => {
  test.each([
    ['ok', async () => ({ status: 'complete' }), 'ok'],
    ['failed', async () => ({ status: 'error', userError: { error: 'boom' } }), 'failed'],
  ])('signing in: %s', async (_, signIn, outcome) => {
    mockSignIn = signIn;
    await show();
    await act(async () => auth.completeSignIn({ code: 'c' }));
    expect(trailed).toHaveBeenCalledWith('user.signed-in', { outcome });
  });

  test('signing out', async () => {
    await show();
    await act(() => auth.signOut());
    expect(trailed).toHaveBeenCalledWith('user.signed-out');
  });

  test.each([
    ['ok', async () => null, 'ok'],
    ['failed', async () => Promise.reject(new Error('offline')), 'failed'],
  ])('deleting the Account: %s', async (_, del, outcome) => {
    mockDelete = del;
    await show();
    await act(() => auth.deleteAccount());
    expect(trailed.mock.calls).toEqual([['account.deletion-started'], ['account.deleted', { outcome }]]);
  });
});
