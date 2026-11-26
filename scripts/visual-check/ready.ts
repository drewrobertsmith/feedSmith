import type { Readable } from 'node:stream';

import { READY_PREFIX } from '../../src/screens/gallery/capture-ready';

/**
 * Watches the app's log for capture mode's ready lines (FEE-121), `adb logcat -v raw` style: one message per
 * line, arriving in chunks that split lines anywhere. `wait` resolves true once its shot has said ready (even
 * if it said so a moment before the wait began), or false when `timeout` ms pass without it.
 */
export function watchReady(log: Readable) {
  const said = new Set<string>();
  const waiting = new Map<string, (ready: boolean) => void>();
  let rest = '';
  const onData = (chunk: Buffer | string) => {
    const lines = (rest + chunk.toString()).split('\n');
    rest = lines.pop() ?? '';
    for (const line of lines) {
      const text = line.trim();
      if (!text.startsWith(`${READY_PREFIX} `)) continue;
      const shot = text.slice(READY_PREFIX.length + 1).split(' ')[0];
      if (!shot) continue;
      said.add(shot);
      waiting.get(shot)?.(true);
    }
  };
  log.on('data', onData);

  return {
    wait(shot: string, timeout: number): Promise<boolean> {
      if (said.has(shot)) return Promise.resolve(true);
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          waiting.delete(shot);
          resolve(false);
        }, timeout);
        waiting.set(shot, (ready) => {
          clearTimeout(timer);
          waiting.delete(shot);
          resolve(ready);
        });
      });
    },
    stop() {
      log.off('data', onData);
      // Anything still waiting ends as not ready.
      for (const end of [...waiting.values()]) end(false);
    },
  };
}
