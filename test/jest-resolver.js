// Jest's module resolver (FEE-33). Reanimated's own resolver loads its and Worklets' web
// initializers, so they run for real instead of crashing on a missing native module. One more
// file follows them: Gesture Handler's UI-runtime bindings, whose native version asks Worklets for
// a UI runtime that the web Worklets doesn't have. Its web version is a no-op, which is right under
// Jest, where there's no native side to bind.
const reanimatedResolver = require('react-native-reanimated/jest/resolver');
const fs = require('fs');
const path = require('path');

const WEB_IN_JEST = ['installUIRuntimeBindings'];

module.exports = (request, options) => {
  if (options.basedir.includes('react-native-gesture-handler') && WEB_IN_JEST.some((name) => request.endsWith(`/${name}`))) {
    const web = path.resolve(options.basedir, `${request}.web.js`);
    if (!fs.existsSync(web)) {
      throw new Error(
        `test/jest-resolver.js (FEE-33): Gesture Handler no longer ships ${web}. Its native UI-runtime ` +
          'bindings crash under Jest with the web Worklets: find their new web no-op and update WEB_IN_JEST.',
      );
    }
    return options.defaultResolver(`${request}.web`, options);
  }
  return reanimatedResolver(request, options);
};
