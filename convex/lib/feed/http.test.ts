import { Effect, Exit } from 'effect';
import { describe, expect, test, vi } from 'vitest';

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

  test('a failed connection or an error status is unreachable', async () => {
    expect((await get('https://example.com/feed', async () => Promise.reject(new TypeError('net')))).tag).toBe('Unreachable');
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
