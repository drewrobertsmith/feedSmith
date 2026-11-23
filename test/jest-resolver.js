// Jest's module resolver (FEE-33). Reanimated's own resolver loads its and Worklets' web
// initializers, so they run for real instead of crashing on a missing native module. One more
// file follows them: Gesture Handler's UI-runtime bindings, whose native version asks Worklets for
// a UI runtime that the web Worklets doesn't have. Its web version is a no-op, which is right under
// Jest, where there's no native side to bind.
const reanimatedResolver = require('react-native-reanimated/jest/resolver');

const WEB_IN_JEST = ['installUIRuntimeBindings'];

module.exports = (request, options) => {
  if (options.basedir.includes('react-native-gesture-handler') && WEB_IN_JEST.some((name) => request.endsWith(`/${name}`))) {
    return options.defaultResolver(`${request}.web`, options);
  }
  return reanimatedResolver(request, options);
};
