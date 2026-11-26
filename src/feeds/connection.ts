import { useEffect, useState } from 'react';

/** Whether the app can reach the server (FEE-32). */
export type Connection = 'online' | 'offline';

/**
 * Convex's connection state as a Connection (FEE-32): offline once the socket has dropped after connecting,
 * or once a first try has failed when the app opened with no connection. Convex reconnects by itself.
 */
export function connectionOf(state: { isWebSocketConnected: boolean; hasEverConnected: boolean; connectionRetries: number }): Connection {
  if (state.isWebSocketConnected) return 'online';
  return state.hasEverConnected || state.connectionRetries > 0 ? 'offline' : 'online';
}

/** How long a drop must last before the app says it's offline: a switch from Wi-Fi to cellular says nothing. */
export const OFFLINE_GRACE = 3000;

/**
 * Whether to say the app is offline (FEE-32): only after a drop has lasted `OFFLINE_GRACE`, and at once when
 * it opened offline. Back online is shown at once. Its timer is cleared when the drop ends or it unmounts (Q20).
 */
export function useSaysOffline(connection: Connection): boolean {
  const [says, setSays] = useState(connection === 'offline');
  useEffect(() => {
    if (connection === 'online') {
      setSays(false);
      return;
    }
    const timer = setTimeout(() => setSays(true), OFFLINE_GRACE);
    return () => clearTimeout(timer);
  }, [connection]);
  return says;
}
