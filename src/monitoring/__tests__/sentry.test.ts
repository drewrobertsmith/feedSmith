import * as Sentry from '@sentry/react-native';

import { renderHook } from '@testing-library/react-native';

import { initSentry, useScreenTracking } from '@/monitoring/sentry';

import type { ExpoConfig } from 'expo/config';
import appJson from '../../../app.json';
import appConfig from '../../../app.config';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  mobileReplayIntegration: jest.fn((options: object) => ({ name: 'MobileReplay', options })),
  feedbackIntegration: jest.fn(() => ({ name: 'Feedback' })),
  reactNavigationIntegration: jest.fn(() => ({ name: 'ReactNavigation', registerNavigationContainer: jest.fn() })),
}));

const mockNavigationRef = { current: null };
jest.mock('expo-router', () => ({ useNavigationContainerRef: () => mockNavigationRef }));

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
    // Restored key by key: the app reads `process.env` through a reference Expo captures, so it's never replaced.
    const saved = { SENTRY_RELEASE: process.env.SENTRY_RELEASE, EXPO_PUBLIC_SENTRY_RELEASE: process.env.EXPO_PUBLIC_SENTRY_RELEASE };
    delete process.env.SENTRY_RELEASE;
    delete process.env.EXPO_PUBLIC_SENTRY_RELEASE;
    try {
      appConfig({ config: appJson.expo as ExpoConfig, projectRoot: '.', staticConfigPath: null, packageJsonPath: null });
      expect(initOptions().release).toMatch(/^com\.mediatedreality\.feedsmith@\d+\.\d+\.\d+\+[0-9a-f]{7,}(-dirty)?$/);
      expect(initOptions().release).toBe(process.env.SENTRY_RELEASE);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  test('takes no screenshots or view hierarchy, and adds no feedback widget', () => {
    const options = initOptions();
    expect(options.attachScreenshot).not.toBe(true);
    expect(options.attachViewHierarchy).not.toBe(true);
    expect(Sentry.feedbackIntegration).not.toHaveBeenCalled();
    const names = (options.integrations as { name: string }[]).map(({ name }) => name);
    expect(names).not.toContain('Feedback');
  });
});

// FEE-136 (T50): every event names its screen, and app start, screen loads and Convex calls are traced and profiled.
describe('initSentry: screens, traces and profiles', () => {
  test('traces and profiles every session', () => {
    const options = initOptions();
    expect(options.tracesSampleRate).toBe(1);
    expect(options.profilesSampleRate).toBe(1);
  });

  test('follows navigation, so events name their screen and screen changes leave breadcrumbs', () => {
    const names = (initOptions().integrations as { name: string }[]).map(({ name }) => name);
    expect(names).toEqual(['MobileReplay', 'ReactNavigation']);
  });

  test("registers Expo Router's navigation container with it", async () => {
    const navigation = (initOptions().integrations as { name: string; registerNavigationContainer?: jest.Mock }[]).find(
      ({ name }) => name === 'ReactNavigation',
    )!;
    await renderHook(() => useScreenTracking());
    expect(navigation.registerNavigationContainer).toHaveBeenCalledWith(mockNavigationRef);
  });

  test('sends trace headers only to the Convex deployment', () => {
    const saved = process.env.EXPO_PUBLIC_CONVEX_URL;
    process.env.EXPO_PUBLIC_CONVEX_URL = 'https://dusty-okapi-659.convex.cloud';
    try {
      expect(initOptions().tracePropagationTargets).toEqual(['https://dusty-okapi-659.convex.cloud']);
    } finally {
      process.env.EXPO_PUBLIC_CONVEX_URL = saved;
    }
  });

  test('sends no trace headers when no Convex deployment is configured', () => {
    const saved = process.env.EXPO_PUBLIC_CONVEX_URL;
    delete process.env.EXPO_PUBLIC_CONVEX_URL;
    try {
      expect(initOptions().tracePropagationTargets).toEqual([]);
    } finally {
      process.env.EXPO_PUBLIC_CONVEX_URL = saved;
    }
  });

  // Q25: link params are untrusted, and `feedsmith://auth?code=…` carries a sign-in code. With PII on (T16),
  // the router integration would attach the concrete URL, the params and the raw deep link; only names go.
  describe('a screen-load trace', () => {
    const detail = {
      'route.name': '/article/[id]',
      'route.path': '/article/[id]',
      'route.url': '/article/k57abc?from=all',
      'route.params.id': 'k57abc',
      'deeplink.url': 'feedsmith://auth?code=secret-sign-in-code',
      'navigation.trigger': 'deeplink',
    };
    const named = { 'route.name': '/article/[id]', 'route.path': '/article/[id]', 'navigation.trigger': 'deeplink' };

    function send(event: object) {
      const beforeSendTransaction = initOptions().beforeSendTransaction!;
      return beforeSendTransaction(event as Parameters<typeof beforeSendTransaction>[0], {}) as Record<string, any>;
    }

    test('keeps route names but drops the URL, params and deep link from the screen load', () => {
      const sent = send({ type: 'transaction', contexts: { trace: { data: { ...detail } } } });
      expect(sent.contexts.trace.data).toEqual(named);
    });

    test('drops them from every span inside the trace too', () => {
      const sent = send({ type: 'transaction', spans: [{ data: { ...detail } }, { data: { 'http.method': 'POST' } }] });
      expect(sent.spans[0].data).toEqual(named);
      expect(sent.spans[1].data).toEqual({ 'http.method': 'POST' });
    });

    test('passes a trace with no route detail through unchanged', () => {
      const event = { type: 'transaction', contexts: { trace: { data: { 'app.start': true } } }, spans: [] };
      expect(send(structuredClone(event))).toEqual(event);
    });
  });
});
