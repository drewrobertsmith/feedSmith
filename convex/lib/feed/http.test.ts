import { Effect, Exit } from 'effect';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { FeedHttp, MAX_BYTES, MAX_REDIRECTS, MAX_VALIDATOR, type Validators } from './http';

type Fake = (url: string, init: RequestInit) => Promise<Response>;

/** Runs `get` against a fake network; never the real one. */
async function get(url: string, fake: Fake, timeoutMs = 1000, validators?: Validators) {
  const fetch = vi.fn(fake);
  const http = FeedHttp.make(fetch as unknown as typeof globalThis.fetch, { timeoutMs });
  const exit = await Effect.runPromiseExit(http.get(url, validators));
  return { exit, fetch, tag: Exit.isFailure(exit) ? exit.cause.toString().match(/(InvalidUrl|Unreachable|Timeout|TooLarge)/)?.[1] : 'ok' };
}

const ok = (body = '<rss/>', headers: Record<string, string> = {}) => async () => new Response(body, { status: 200, headers });
const redirect = (location: string) => new Response(null, { status: 301, headers: { location } });

describe('only safe addresses are fetched (T18)', () => {
  test.each([
    ['http', 'http://example.com/feed'],
    ['javascript', 'javascript:alert(1)'],
    ['file', 'file:///etc/passwd'],
    ['ftp', 'ftp://example.com/feed'],
    ['not a URL', 'not a url'],
    ['localhost', 'https://localhost/feed'],
    ['a .localhost name', 'https://app.localhost/feed'],
    ['a .local name', 'https://printer.local/feed'],
    ['a .internal name', 'https://metadata.google.internal/feed'],
    ['an IPv4 address', 'https://127.0.0.1/feed'],
    ['a private IPv4 address', 'https://10.0.0.1/feed'],
    ['the cloud metadata address', 'https://169.254.169.254/latest'],
    ['an IPv6 address', 'https://[::1]/feed'],
    ['a decimal IP', 'https://2130706433/feed'],
    ['a non-default port', 'https://example.com:8443/feed'],
    ['a username and password', 'https://user:pass@example.com/feed'],
  ])('refuses %s without fetching', async (_case, url) => {
    const { tag, fetch } = await get(url, ok());
    expect(tag).toBe('InvalidUrl');
    expect(fetch).not.toHaveBeenCalled();
  });

  test('a redirect to http is refused', async () => {
    const { tag } = await get('https://example.com/feed', async () => redirect('http://example.com/feed'));
    expect(tag).toBe('InvalidUrl');
  });

  test('a redirect to a private address is refused', async () => {
    const { tag, fetch } = await get('https://example.com/feed', async () => redirect('https://169.254.169.254/'));
    expect(tag).toBe('InvalidUrl');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test(`follows up to ${MAX_REDIRECTS} redirects, re-checking each, and gives up after`, async () => {
    let n = 0;
    const follow = await get('https://example.com/0', async (url) =>
      url.endsWith(`/${MAX_REDIRECTS}`) ? new Response('<rss/>') : redirect(`/` + ++n),
    );
    expect(follow.tag).toBe('ok');
    expect(follow.fetch).toHaveBeenCalledTimes(MAX_REDIRECTS + 1);
    for (const [, init] of follow.fetch.mock.calls) expect(init.redirect).toBe('manual');

    const loop = await get('https://example.com/feed', async () => redirect('https://example.com/feed'));
    expect(loop.tag).toBe('Unreachable');
  });
});

describe('responses are bounded', () => {
  test(`a declared body over ${MAX_BYTES} bytes is refused before reading`, async () => {
    const { tag } = await get('https://example.com/feed', ok('x', { 'content-length': String(MAX_BYTES + 1) }));
    expect(tag).toBe('TooLarge');
  });

  test('an undeclared body stops being read at the cap', async () => {
    const chunk = new Uint8Array(64 * 1024);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.length;
        controller.enqueue(chunk);
      },
    });
    const { tag } = await get('https://example.com/feed', async () => new Response(stream));
    expect(tag).toBe('TooLarge');
    // The stream may read ahead a chunk or two; it never runs on unbounded.
    expect(sent).toBeLessThanOrEqual(MAX_BYTES + 3 * chunk.length);
  });

  test('a server that never answers times out', async () => {
    const { tag } = await get('https://example.com/feed', () => new Promise(() => {}), 50);
    expect(tag).toBe('Timeout');
  });

  // A failed connection is retried first: see "a network blip is retried" below (FEE-111).
  test('an error status is unreachable', async () => {
    expect((await get('https://example.com/feed', async () => new Response('no', { status: 404 }))).tag).toBe('Unreachable');
  });
});

test('returns the body as text, asking for feeds', async () => {
  const { exit, fetch } = await get('https://example.com/feed', ok('<rss version="2.0"/>'));
  expect(Exit.isSuccess(exit) && exit.value).toEqual({ _tag: 'Fetched', body: '<rss version="2.0"/>', url: 'https://example.com/feed' });
  const [, init] = fetch.mock.calls[0];
  expect(new Headers(init.headers).get('accept')).toContain('application/rss+xml');
});

test('a body that happens to read "too-large" is just a body', async () => {
  const { exit } = await get('https://example.com/feed', ok('too-large'));
  expect(Exit.isSuccess(exit) && exit.value).toEqual({ _tag: 'Fetched', body: 'too-large', url: 'https://example.com/feed' });
});

describe('conditional requests (T19)', () => {
  test("keeps the Feed's ETag and Last-Modified", async () => {
    const { exit } = await get(
      'https://example.com/feed',
      ok('<rss/>', { etag: '"abc"', 'last-modified': 'Sat, 21 Nov 2026 12:00:00 GMT' }),
    );
    expect(Exit.isSuccess(exit) && exit.value).toEqual({
      _tag: 'Fetched',
      body: '<rss/>',
      url: 'https://example.com/feed',
      etag: '"abc"',
      lastModified: 'Sat, 21 Nov 2026 12:00:00 GMT',
    });
  });

  test('sends them back, and a 304 means nothing changed', async () => {
    const { exit, fetch } = await get('https://example.com/feed', async () => new Response(null, { status: 304 }), 1000, {
      etag: '"abc"',
      lastModified: 'Sat, 21 Nov 2026 12:00:00 GMT',
    });
    expect(Exit.isSuccess(exit) && exit.value).toEqual({ _tag: 'NotModified' });
    const headers = new Headers(fetch.mock.calls[0][1].headers);
    expect(headers.get('if-none-match')).toBe('"abc"');
    expect(headers.get('if-modified-since')).toBe('Sat, 21 Nov 2026 12:00:00 GMT');
  });

  test(`a validator over ${MAX_VALIDATOR} characters, or with control characters, is never kept or sent`, async () => {
    const huge = `"${'x'.repeat(MAX_VALIDATOR)}"`;
    const kept = await get('https://example.com/feed', ok('<rss/>', { etag: huge }));
    expect(Exit.isSuccess(kept.exit) && kept.exit.value).toEqual({ _tag: 'Fetched', body: '<rss/>', url: 'https://example.com/feed' });

    const sent = await get('https://example.com/feed', ok(), 1000, { etag: '"a"\r\nX-Evil: 1', lastModified: huge });
    const headers = new Headers(sent.fetch.mock.calls[0][1].headers);
    expect(headers.get('if-none-match')).toBeNull();
    expect(headers.get('if-modified-since')).toBeNull();
  });

  test('a 304 to a request without validators is unreachable, not "nothing changed"', async () => {
    const { tag } = await get('https://example.com/feed', async () => new Response(null, { status: 304 }));
    expect(tag).toBe('Unreachable');
  });
});

test('reports the address it finally read, after redirects (T21)', async () => {
  const { exit } = await get('https://example.com/', async (url) =>
    url === 'https://example.com/' ? redirect('https://www.example.com/') : new Response('<html/>'),
  );
  expect(Exit.isSuccess(exit) && exit.value).toEqual({ _tag: 'Fetched', body: '<html/>', url: 'https://www.example.com/' });
});

describe('a network blip is retried inside the fetch limit (FEE-111, T18)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /** `get` on a fake clock, run until it settles, with the policy's real 10-second limit. */
  async function settled(url: string, fake: Fake, validators?: Validators) {
    const calls: number[] = [];
    const pending = get(url, (u, init) => (calls.push(Date.now()), fake(u, init)), 10_000, validators);
    await vi.advanceTimersByTimeAsync(11_000);
    return { ...(await pending), calls };
  }

  const reject = async () => Promise.reject(new TypeError('connection reset'));
  const status = (code: number) => async () => new Response('busy', { status: code });
  /** Fails with `first` this many times, then serves a feed. */
  const blips = (times: number, first: Fake): Fake => {
    let n = 0;
    return (url, init) => (n++ < times ? first(url, init) : ok()());
  };
  const TRANSIENT: [string, Fake][] = [
    ['a failed connection', reject],
    ['429', status(429)],
    ['502', status(502)],
    ['503', status(503)],
    ['504', status(504)],
  ];

  test.each(TRANSIENT)('%s twice, then an answer, is fetched', async (_, first) => {
    const { tag, fetch } = await settled('https://example.com/feed', blips(2, first));
    expect(tag).toBe('ok');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test.each(TRANSIENT)('%s every time is tried three times, then unreachable', async (_, always) => {
    const { tag, fetch } = await settled('https://example.com/feed', always);
    expect(tag).toBe('Unreachable');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test.each([400, 401, 403, 404, 410, 500])('a %i is never retried', async (code) => {
    const { tag, fetch } = await settled('https://example.com/feed', status(code));
    expect(tag).toBe('Unreachable');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('an invalid address, a body over the cap, and too many redirects are never retried', async () => {
    expect((await settled('http://example.com/feed', ok())).fetch).not.toHaveBeenCalled();
    const big = await settled('https://example.com/feed', ok('x', { 'content-length': String(MAX_BYTES + 1) }));
    expect(big).toMatchObject({ tag: 'TooLarge' });
    expect(big.fetch).toHaveBeenCalledTimes(1);
    const loop = await settled('https://example.com/feed', async () => redirect('/again'));
    expect(loop.tag).toBe('Unreachable');
    expect(loop.fetch).toHaveBeenCalledTimes(MAX_REDIRECTS + 1);
  });

  test('a retry still refuses a redirect to a private address', async () => {
    const sneaky = await settled(
      'https://example.com/feed',
      (() => {
        let n = 0;
        return async () => (n++ === 0 ? new Response('busy', { status: 503 }) : redirect('https://169.254.169.254/'));
      })(),
    );
    expect(sneaky.tag).toBe('InvalidUrl');
    expect(sneaky.fetch).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['shortest', 0, [400, 800]],
    ['longest', 0.999_999, [600, 1200]],
  ])('the waits grow from about 500 ms, spread between 0.8× and 1.2× (%s)', async (_, random, waits) => {
    vi.spyOn(Math, 'random').mockReturnValue(random);
    const { calls } = await settled('https://example.com/feed', status(503));
    expect(calls[1] - calls[0]).toBeCloseTo(waits[0], -0.5);
    expect(calls[2] - calls[1]).toBeCloseTo(waits[1], -0.5);
  });

  test('the whole fetch, retries and waits included, still times out at 10 seconds', async () => {
    const slowlyBusy = async () => {
      await new Promise((resolve) => setTimeout(resolve, 4_000));
      return new Response('busy', { status: 503 });
    };
    const { tag, calls } = await settled('https://example.com/feed', slowlyBusy);
    expect(tag).toBe('Timeout');
    expect(calls.at(-1)! - calls[0]).toBeLessThan(10_000);
  });

  test('a server that never answers is not retried: it times out once', async () => {
    const { tag, fetch } = await settled('https://example.com/feed', () => new Promise(() => {}));
    expect(tag).toBe('Timeout');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('every try sends the Feed\'s validators (T19)', async () => {
    const { fetch } = await settled('https://example.com/feed', blips(2, reject), { etag: '"v1"', lastModified: 'Sat, 21 Nov 2026 12:00:00 GMT' });
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const [, init] of fetch.mock.calls) {
      expect(init.headers).toMatchObject({ 'if-none-match': '"v1"', 'if-modified-since': 'Sat, 21 Nov 2026 12:00:00 GMT' });
    }
  });
});
