import { vi } from 'vitest';

/** One structured server log line (FEE-113), as the server logger writes it. */
export type LogLine = { level: string; message: unknown; annotations: Record<string, unknown>; spans: Record<string, number>; cause?: string };

/**
 * Spies on the console for one test: `lines()` gives the server's JSON log lines, and `all()` every
 * raw console call, for checking that nothing secret (a Feed URL, a typed name) was written at all.
 */
export function captureLogs() {
  const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
  const calls = () => spies.flatMap((spy) => spy.mock.calls);
  return {
    all: () => JSON.stringify(calls()),
    lines: (message?: string): LogLine[] =>
      calls()
        .flatMap((call) => {
          try {
            return [JSON.parse(String(call[0])) as LogLine];
          } catch {
            return [];
          }
        })
        .filter((line) => message === undefined || line.message === message),
    restore: () => spies.forEach((spy) => spy.mockRestore()),
  };
}
