// Expo Router's testing library loads `expo-router/build/testing-library/mocks`, which swaps
// Reanimated and Worklets for their mocks. feedSmith runs them for real (FEE-33), so this copy keeps
// only its other two mocks: gesture handler's own Jest setup, and `expo-linking`'s scheme.
try {
  require('react-native-gesture-handler/jestSetup');
} catch {}

jest.mock('expo-linking', () => ({
  ...jest.requireActual('expo-linking'),
  createURL(path) {
    return 'yourscheme://' + path;
  },
  resolveScheme() {
    return 'yourscheme';
  },
  addEventListener() {
    return { remove() {} };
  },
}));
