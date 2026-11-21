import * as Sentry from '@sentry/react-native';

import { initSentry } from '@/monitoring/sentry';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  mobileReplayIntegration: jest.fn((options: object) => ({ name: 'MobileReplay', options })),
  feedbackIntegration: jest.fn(() => ({ name: 'Feedback' })),
}));

const init = jest.mocked(Sentry.init);

function initOptions() {
  init.mockClear();
  initSentry();
  expect(init).toHaveBeenCalledTimes(1);
  return init.mock.calls[0][0]!;
}

// T16 / Q12: crash reports with PII, Sentry Logs and Session Replay, replay masked.
describe('initSentry', () => {
  test('reports to a Sentry ingest address over HTTPS', () => {
    expect(initOptions().dsn).toMatch(/^https:\/\/[0-9a-f]+@[\w.]+\.ingest\.(us\.)?sentry\.io\/\d+$/);
  });

  test('sends default PII and Sentry Logs', () => {
    const options = initOptions();
    expect(options.sendDefaultPii).toBe(true);
    expect(options.enableLogs).toBe(true);
  });

  // Q26: console output (the app's libraries included) never becomes a Sentry log.
  test('sends only logs written on purpose, not console output', () => {
    expect(initOptions().enableAutoConsoleLogs).toBe(false);
  });

  test('replays 10% of sessions and every session with an error', () => {
    const options = initOptions();
    expect(options.replaysSessionSampleRate).toBe(0.1);
    expect(options.replaysOnErrorSampleRate).toBe(1);
  });

  test('masks all text, images and vectors in replays', () => {
    initOptions();
    expect(Sentry.mobileReplayIntegration).toHaveBeenCalledWith({
      maskAllText: true,
      maskAllImages: true,
      maskAllVectors: true,
    });
  });

  test('takes no screenshots or view hierarchy, and adds no feedback widget', () => {
    const options = initOptions();
    expect(options.attachScreenshot).not.toBe(true);
    expect(options.attachViewHierarchy).not.toBe(true);
    expect(Sentry.feedbackIntegration).not.toHaveBeenCalled();
    const names = (options.integrations as { name: string }[]).map(({ name }) => name);
    expect(names).toEqual(['MobileReplay']);
  });
});
