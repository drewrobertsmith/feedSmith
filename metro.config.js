// https://docs.uniwind.dev/api/metro-config — withUniwindConfig must stay the outermost wrapper.
// Sentry's Expo config is the base: it adds Debug IDs so uploaded source maps match bundles (T16).
const path = require('path');
const { getSentryExpoConfig } = require('@sentry/react-native/metro');
const { withUniwindConfig } = require('uniwind/metro');

const config = getSentryExpoConfig(__dirname);

// repos/ holds vendored library source for agents to read, never to bundle (T38).
config.resolver.blockList = [
  ...[].concat(config.resolver.blockList ?? []),
  new RegExp(`^${path.join(__dirname, 'repos').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[/\\\\]`),
];

module.exports = withUniwindConfig(config, {
  cssEntryFile: './src/global.css',
  dtsFile: './src/uniwind-types.d.ts',
});
