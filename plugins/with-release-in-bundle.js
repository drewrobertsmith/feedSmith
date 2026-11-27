// FEE-144: every build's JS bundle carries that build's Sentry release name (T50). The name is inlined into the
// bundle (`EXPO_PUBLIC_SENTRY_RELEASE`), but Gradle's bundle task didn't count it as an input: a commit with no code
// change (a squash merge) reused the last bundle, and the last commit's name with it. Here the name is an input, so a
// new name rebuilds the bundle and the same name still doesn't.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// feedSmith (FEE-144): the release name is an input of the JS bundle.';

function addReleaseInput(gradle) {
  if (gradle.includes(MARK)) return gradle;
  return `${gradle.trimEnd()}\n\n${MARK}\ntasks.matching { it.name ==~ /createBundle.*JsAndAssets/ }.configureEach {\n    inputs.property("sentryRelease", System.getenv("SENTRY_RELEASE") ?: "")\n}\n`;
}

const withReleaseInBundle = (config) =>
  withAppBuildGradle(config, (mod) => {
    mod.modResults.contents = addReleaseInput(mod.modResults.contents);
    return mod;
  });

module.exports = withReleaseInBundle;
module.exports.addReleaseInput = addReleaseInput;
