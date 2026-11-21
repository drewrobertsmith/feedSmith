import * as Sentry from '@sentry/react-native';

// The DSN identifies the project to send to; it ships in the app and isn't a secret (FEE-20).
const dsn =
  'https://74efdb3d193e42142a2216e3b1dca343@o4507147687821312.ingest.us.sentry.io/4512471734484992';

/**
 * Starts crash reporting (T16): PII and Sentry Logs on, and Session Replay with every
 * text, image and vector masked so a replay never shows what's being read (Q12).
 * Call once, before the root renders.
 */
export function initSentry() {
  Sentry.init({
    dsn,
    sendDefaultPii: true,
    enableLogs: true,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    integrations: [
      Sentry.mobileReplayIntegration({
        maskAllText: true,
        maskAllImages: true,
        maskAllVectors: true,
      }),
    ],
  });
}
