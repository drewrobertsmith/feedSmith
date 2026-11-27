import '@/global.css';

import * as Sentry from '@sentry/react-native';

import { initSentry, useScreenTracking } from '@/monitoring/sentry';
import { AppRoot } from '@/navigation/app-root';

initSentry();

function RootLayout() {
  useScreenTracking();
  return <AppRoot />;
}

export default Sentry.wrap(RootLayout);
