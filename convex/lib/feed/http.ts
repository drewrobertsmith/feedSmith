import { Context, Effect, Layer } from 'effect';

import { InvalidUrl, TooLarge, Timeout, Unreachable, type FetchError } from './errors';

/** The fetch policy (T18). */
export const MAX_REDIRECTS = 3;
export const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal'];

/**
 * The URL to fetch, or null when the policy refuses it: `https:` only, on the default
 * port, with no credentials, and a host that is a domain name. IP addresses (in any
 * spelling) and local names are refused, so a Feed can't aim the server at itself.
 */
export function safeUrl(input: string, base?: string): URL | null {
  let url: URL;
  try {
    url = new URL(input.trim(), base);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return null;
  // IPv6 literals keep their brackets; IPv4 in any form normalises to digits and dots.
  if (host.startsWith('[') || /^[\d.]+$/.test(host)) return null;
  // A domain name has a dot and a top-level label that isn't all digits.
  const labels = host.split('.');
  if (labels.length < 2 || /^\d+$/.test(labels.at(-1)!)) return null;
  return url;
}

const HEADERS = {
  accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.1',
  'user-agent': 'feedSmith/1.0',
};

async function readCapped(response: Response): Promise<string | 'too-large'> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BYTES) {
    await response.body?.cancel();
    return 'too-large';
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      return 'too-large';
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

type Fetch = typeof globalThis.fetch;

/** The one way feedSmith's server reaches the network (T18). */
export class FeedHttp extends Context.Service<
  FeedHttp,
  {
    /** Fetches `url` under the policy and returns its body as text. */
    get(url: string): Effect.Effect<string, FetchError>;
  }
>()('feedsmith/feed/FeedHttp') {
  static make(fetch: Fetch, options: { timeoutMs?: number } = {}): FeedHttp['Service'] {
    const once = (url: URL) =>
      Effect.tryPromise({
        try: (signal) => fetch(url.href, { redirect: 'manual', headers: HEADERS, signal }),
        catch: () => new Unreachable(),
      });

    const get = Effect.fnUntraced(function* (input: string): Effect.fn.Return<string, FetchError> {
      let url = safeUrl(input);
      if (!url) return yield* new InvalidUrl();
      for (let hop = 0; ; hop++) {
        const response = yield* once(url);
        if (response.status >= 300 && response.status < 400) {
          if (hop >= MAX_REDIRECTS) return yield* new Unreachable();
          const next = safeUrl(response.headers.get('location') ?? '', url.href);
          if (!next) return yield* new InvalidUrl();
          url = next;
          continue;
        }
        if (!response.ok) return yield* new Unreachable();
        const body = yield* Effect.tryPromise({ try: () => readCapped(response), catch: () => new Unreachable() });
        if (body === 'too-large') return yield* new TooLarge();
        return body;
      }
    });

    return FeedHttp.of({
      get: (url) =>
        get(url).pipe(
          Effect.timeoutOrElse({
            duration: options.timeoutMs ?? TIMEOUT_MS,
            orElse: () => Effect.fail(new Timeout()),
          }),
        ),
    });
  }

  /** The live network: the runtime's `fetch`. */
  static readonly layer = Layer.sync(FeedHttp, () => FeedHttp.make((input, init) => fetch(input, init)));
}
