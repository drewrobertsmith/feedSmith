import { Cause, Effect } from 'effect';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { scrub, ServerLogs, URL_PLACEHOLDER } from './log';

const SECRET = 'https://private.example.com/feed?token=s3cret';

describe('the scrubber removes anything URL-shaped (Q9, FEE-113)', () => {
  test.each([
    ['a URL in text', `fetching ${SECRET} failed`, `fetching ${URL_PLACEHOLDER} failed`],
    ['any scheme, any case', 'see HTTP://A.EXAMPLE.COM/x and ftp://b.example.com', `see ${URL_PLACEHOLDER} and ${URL_PLACEHOLDER}`],
    ['a percent-encoded URL', 'next=https%3A%2F%2Fprivate.example.com%2Ffeed', `next=${URL_PLACEHOLDER}`],
    ['a www host with a path', 'moved to www.private.example.com/feed.xml', `moved to ${URL_PLACEHOLDER}`],
    ['a host with a path and no scheme', 'GET private.example.com/feed?token=1 -> 500', `GET ${URL_PLACEHOLDER} -> 500`],
    ['a URL inside quotes', `{"url":"${SECRET}"}`, `{"url":"${URL_PLACEHOLDER}"}`],
  ])('%s', (_, input, expected) => {
    expect(scrub(input)).toBe(expected);
  });

  test("text that isn't a URL is left alone", () => {
    const plain = 'Feed k57abc failed: timeout after 3 tries (convex/refresh.ts:55:10), 1.5 s';
    expect(scrub(plain)).toBe(plain);
  });

  test('it walks nested fields, arrays and errors', () => {
    const error = new Error(`storing ${SECRET} broke`);
    const out = JSON.stringify(scrub({ feed: { links: [SECRET, { href: SECRET }] }, error }));
    expect(out).not.toContain('private.example.com');
    expect(out).toContain('storing [url] broke');
  });

  test('hostile data: deep nesting, huge strings and cycles finish quickly and never throw', () => {
    let deep: unknown = SECRET;
    for (let i = 0; i < 100_000; i++) deep = [deep];
    const cyclic: Record<string, unknown> = { url: SECRET };
    cyclic.self = cyclic;
    const huge = `${'x'.repeat(2_000_000)} ${SECRET}`;
    const start = performance.now();
    const out = JSON.stringify([scrub(deep), scrub(cyclic), scrub(huge)]);
    expect(performance.now() - start).toBeLessThan(500);
    expect(out).not.toContain('private.example.com');
    expect(out.length).toBeLessThan(20_000);
  });
});

describe('the server logger writes scrubbed JSON lines (FEE-113)', () => {
  type Level = 'log' | 'warn' | 'error';
  const spies = {} as Record<Level, { mock: { calls: unknown[][] } }>;
  beforeEach(() => {
    for (const level of ['log', 'warn', 'error'] as const) spies[level] = vi.spyOn(console, level).mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  const lines = (level: Level) => spies[level].mock.calls.map((call) => JSON.parse(String(call[0])));

  test('each level goes to its console method, as one JSON line with its fields', () => {
    Effect.runSync(
      Effect.gen(function* () {
        yield* Effect.logInfo('feed fetched');
        yield* Effect.logWarning('network blip, retrying');
        yield* Effect.logError('fetch defect');
      }).pipe(Effect.annotateLogs({ feedId: 'k57abc', outcome: 'fetched' }), Effect.provide(ServerLogs)),
    );
    expect(lines('log')).toEqual([expect.objectContaining({ level: 'INFO', message: 'feed fetched', annotations: { feedId: 'k57abc', outcome: 'fetched' } })]);
    expect(lines('warn')).toEqual([expect.objectContaining({ level: 'WARN', message: 'network blip, retrying' })]);
    expect(lines('error')).toEqual([expect.objectContaining({ level: 'ERROR', message: 'fetch defect' })]);
  });

  test('a URL in the message, an annotation or a defect never reaches the console', () => {
    Effect.runSync(
      Effect.logError(`fetching ${SECRET}`, Cause.die(new Error(`storing ${SECRET} broke`))).pipe(
        Effect.annotateLogs({ link: SECRET }),
        Effect.provide(ServerLogs),
      ),
    );
    const [line] = lines('error');
    expect(line.cause).toContain('storing [url] broke');
    expect(JSON.stringify(spies.error.mock.calls)).not.toContain('private.example.com');
  });

  test('a log span says how long its work took', () => {
    vi.useFakeTimers();
    const program = Effect.sleep('1500 millis').pipe(Effect.andThen(Effect.logInfo('done')), Effect.withLogSpan('fetch'), Effect.provide(ServerLogs));
    const done = Effect.runPromise(program);
    vi.advanceTimersByTime(1500);
    return done.then(() => {
      vi.useRealTimers();
      expect(lines('log')[0].spans.fetch).toBeGreaterThanOrEqual(1500);
    });
  });
});
