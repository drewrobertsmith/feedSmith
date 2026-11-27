import * as Sentry from '@sentry/react-native';

import { identify } from '@/monitoring/identify';

jest.mock('@sentry/react-native', () => ({ setUser: jest.fn() }));

const setUser = jest.mocked(Sentry.setUser);

beforeEach(() => setUser.mockClear());

// FEE-138 (T50): crash reports carry the User's opaque id and nothing else about them.
describe('identify', () => {
  test('a signed-in User is their opaque id only', () => {
    identify('j57user123');
    expect(setUser).toHaveBeenCalledWith({ id: 'j57user123' });
  });

  test('signed out, crash reports carry no User', () => {
    identify(null);
    expect(setUser).toHaveBeenCalledWith(null);
  });
});
