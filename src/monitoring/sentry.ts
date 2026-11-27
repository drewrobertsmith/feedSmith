import * as Sentry from '@sentry/react-native';
import { useNavigationContainerRef } from 'expo-router';
import { useEffect } from 'react';

// The DSN identifies the project to send to; it ships in the app and isn't a secret (FEE-20).
const dsn =
  'https://74efdb3d193e42142a2216e3b1dca343@o4507147687821312.ingest.us.sentry.io/4512471734484992';

// Every session is traced while feedSmith has one User (T50); lower this once other people use it.
const TRACES_SAMPLE_RATE = 1;
// Off: the free Sentry plan drops profiles, so collecting them only costs CPU, battery and data (T51).
// Set to 1 when the plan includes profiling.
const PROFILES_SAMPLE_RATE = 0;

type SpanData = Record<string, unknown> | undefined;
type Transaction = { contexts?: { trace?: { data?: SpanData } }; spans?: { data?: SpanData }[] };

/**
 * With PII on (T16), the router integration attaches a screen's concrete URL, its params and the raw deep link
 * (`feedsmith://auth?code=…` carries a sign-in code). Link params are untrusted (Q25), so only route names go.
 */
function withoutRouteDetail(data: SpanData) {
  if (!data) return;
  for (const key of Object.keys(data)) {
    if (key === 'route.url' || key === 'deeplink.url' || key.startsWith('route.params.')) delete data[key];
  }
}

function scrubTransaction<T extends Transaction>(event: T): T {
  withoutRouteDetail(event.contexts?.trace?.data);
  for (const span of event.spans ?? []) withoutRouteDetail(span.data);
  return event;
}

/**
 * Names the screen on every event, leaves a breadcrumb per screen change and times screen loads (T50). Registered by
 * hand: Sentry's `expoRouterIntegration` reads a module expo-router 58 no longer has, and silently does nothing.
 */
const navigation = Sentry.reactNavigationIntegration();

/** Connects Expo Router's navigation container to Sentry. Call once, in the root layout. */
export function useScreenTracking() {
  const ref = useNavigationContainerRef();
  useEffect(() => {
    navigation.registerNavigationContainer(ref);
  }, [ref]);
}

/**
 * Starts crash reporting (T16): PII and Sentry Logs on, and Session Replay with every
 * text, image and vector masked so a replay never shows what's being read (Q12). Screens, traces
 * and profiles as T50 says.
 * Call once, before the root renders.
 */
export function initSentry() {
  Sentry.init({
    dsn,
    // Named after the commit by the build's app config, the same name its source maps upload under (T50).
    // Unset outside a git checkout, when Sentry's default name applies.
    release: process.env.EXPO_PUBLIC_SENTRY_RELEASE,
    sendDefaultPii: true,
    enableLogs: true,
    // Only `Sentry.logger` calls become logs; console output stays on the phone (Q26).
    enableAutoConsoleLogs: false,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1,
    tracesSampleRate: TRACES_SAMPLE_RATE,
    profilesSampleRate: PROFILES_SAMPLE_RATE,
    // Trace headers go only to the Convex deployment, never to a Feed's site or anywhere else.
    tracePropagationTargets: process.env.EXPO_PUBLIC_CONVEX_URL ? [process.env.EXPO_PUBLIC_CONVEX_URL] : [],
    beforeSendTransaction: scrubTransaction,
    integrations: [
      Sentry.mobileReplayIntegration({
        maskAllText: true,
        maskAllImages: true,
        maskAllVectors: true,
      }),
      navigation,
    ],
  });
}
