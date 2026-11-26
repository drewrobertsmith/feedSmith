import { Logger } from 'effect';

/**
 * How the server logs (FEE-113, T45): one JSON line per entry, with everything URL-shaped removed
 * first, so a Feed URL can never reach the logs whatever a program logs (Q9). Server Effect programs
 * log only through `ServerLogs`; this is the one place on the server that writes to the console.
 */

/** What a URL becomes in a log line. */
export const URL_PLACEHOLDER = '[url]';

/** Anything URL-shaped: a scheme, the same percent-encoded, a `www.` host, or any host with a path. */
const URL_SHAPES = [
  /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>\\]*/gi,
  /\b[a-z][a-z0-9+.-]*%3A%2F%2F[^\s"'<>\\]*/gi,
  /\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:[/?#:][^\s"'<>\\]*)?/gi,
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?::\d+)?[/?#][^\s"'<>\\]*/gi,
];
/** A string longer than this is cut before it's scrubbed, which also bounds the scrubber's cost. */
const MAX_STRING = 2_000;
/** Nesting deeper than this is summarised, not walked. */
const MAX_DEPTH = 8;

function scrubString(text: string): string {
  // Cut first, then drop the token the cut split, so half a URL can't slip past the patterns.
  const cut = text.length > MAX_STRING ? `${text.slice(0, MAX_STRING).replace(/\S*$/, '')}…` : text;
  return URL_SHAPES.reduce((out, shape) => out.replace(shape, URL_PLACEHOLDER), cut);
}

/** `value` with every string in it scrubbed of URLs, walked to a bounded depth. Never throws. */
export function scrub(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return scrubString(value);
  if (value === null || typeof value !== 'object') return typeof value === 'bigint' ? String(value) : value;
  if (depth >= MAX_DEPTH) return '[nested]';
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (value instanceof Error) return { name: value.name, message: scrubString(value.message), stack: value.stack && scrubString(value.stack) };
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1, seen));
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [scrubString(key), scrub(inner, depth + 1, seen)]));
}

/** The server's logger: Effect's structured entry (message, level, fields, spans, cause), scrubbed, as one JSON line. */
const serverLogger = Logger.make((options) => {
  const { message, level, annotations, spans, cause } = Logger.formatStructured.log(options);
  const line = JSON.stringify(scrub({ level, message, annotations, spans, cause }));
  if (options.logLevel === 'Error' || options.logLevel === 'Fatal') console.error(line);
  else if (options.logLevel === 'Warn') console.warn(line);
  else console.log(line);
});

/** Replaces Effect's default logger with the server's. */
export const ServerLogs = Logger.layer([serverLogger]);
