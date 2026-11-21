import '@/global.css';

import * as Sentry from '@sentry/react-native';

import { initSentry } from '@/monitoring/sentry';
import { AppRoot } from '@/navigation/app-root';

initSentry();

function RootLayout() {
  return <AppRoot />;
}

export default Sentry.wrap(RootLayout);
