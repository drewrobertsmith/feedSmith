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
  test('reports to the feedsmith project', () => {
    expect(initOptions().dsn).toBe(
      'https://74efdb3d193e42142a2216e3b1dca343@o4507147687821312.ingest.us.sentry.io/4512471734484992',
    );
  });

  test('sends default PII and Sentry Logs', () => {
    const options = initOptions();
    expect(options.sendDefaultPii).toBe(true);
    expect(options.enableLogs).toBe(true);
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
