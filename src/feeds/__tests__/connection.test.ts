import { connectionOf } from '@/feeds/connection';

const base = { isWebSocketConnected: true, hasEverConnected: true, connectionRetries: 0 };

test('connected is online', () => {
  expect(connectionOf(base)).toBe('online');
});

test('a dropped socket after connecting is offline', () => {
  expect(connectionOf({ ...base, isWebSocketConnected: false })).toBe('offline');
});

test('starting up, before the first try has failed, is not yet offline', () => {
  expect(connectionOf({ isWebSocketConnected: false, hasEverConnected: false, connectionRetries: 0 })).toBe('online');
});

test('opening with no connection at all is offline once a try has failed', () => {
  expect(connectionOf({ isWebSocketConnected: false, hasEverConnected: false, connectionRetries: 1 })).toBe('offline');
});
