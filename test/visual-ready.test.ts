import { PassThrough } from 'node:stream';

import { watchReady } from '../scripts/visual-check/ready';
import { readyLine } from '../src/screens/gallery/capture-ready';

/** A log stream as `adb logcat -v raw` gives it: one message per line, in chunks that split lines anywhere. */
function logStream() {
  const stream = new PassThrough();
  return { stream, say: (text: string) => stream.write(text) };
}

test('resolves ready when its own shot says so, even split across chunks', async () => {
  const { stream, say } = logStream();
  const watch = watchReady(stream);
  const waiting = watch.wait('5', 1000);
  say('[Reanimated] something else\nvisual-check rea');
  say(`dy 5 all-dark-dark\n`);
  await expect(waiting).resolves.toBe(true);
  watch.stop();
});

test("another shot's line, an earlier run's, doesn't count", async () => {
  const { stream, say } = logStream();
  const watch = watchReady(stream);
  const waiting = watch.wait('6', 50);
  say(`${readyLine('5', 'all-dark-dark')}\n${readyLine('16', 'all-dark-dark')}\n`);
  await expect(waiting).resolves.toBe(false);
  watch.stop();
});

test('a line that came before the wait began still counts', async () => {
  const { stream, say } = logStream();
  const watch = watchReady(stream);
  say(`${readyLine('7', 'all-light-light')}\n`);
  await new Promise((resolve) => setImmediate(resolve));
  await expect(watch.wait('7', 50)).resolves.toBe(true);
  watch.stop();
});

test('no line in time is "never ready", and the run goes on', async () => {
  const { stream } = logStream();
  const watch = watchReady(stream);
  const started = Date.now();
  await expect(watch.wait('8', 30)).resolves.toBe(false);
  expect(Date.now() - started).toBeLessThan(1000);
  watch.stop();
});
