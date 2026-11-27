import * as Sentry from '@sentry/react-native';

import { initSentry } from '@/monitoring/sentry';

import type { ExpoConfig } from 'expo/config';
import appJson from '../../../app.json';
import appConfig from '../../../app.config';

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

  // FEE-135: the release the build's app config names, which is also what its source maps upload under.
  test('reports the release the build named after its commit', () => {
    const saved = { ...process.env };
    delete process.env.SENTRY_RELEASE;
    delete process.env.EXPO_PUBLIC_SENTRY_RELEASE;
    try {
      appConfig({ config: appJson.expo as ExpoConfig, projectRoot: '.', staticConfigPath: null, packageJsonPath: null });
      expect(initOptions().release).toMatch(/^com\.mediatedreality\.feedsmith@\d+\.\d+\.\d+\+[0-9a-f]{7,}(-dirty)?$/);
      expect(initOptions().release).toBe(process.env.SENTRY_RELEASE);
    } finally {
      process.env = saved;
    }
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
