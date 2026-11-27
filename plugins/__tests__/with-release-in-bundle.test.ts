import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { addReleaseInput } from '../with-release-in-bundle';

const GRADLE = `apply plugin: "com.android.application"\n\nreact {\n    autolinkLibrariesWithApp()\n}\n`;

// FEE-144: a build whose code didn't change reused the last bundle, and with it the last commit's release name.
describe('addReleaseInput', () => {
  test('makes the release name an input of every JS bundle task, so a new name rebuilds the bundle', () => {
    const gradle = addReleaseInput(GRADLE);
    expect(gradle.startsWith(GRADLE)).toBe(true);
    expect(gradle).toMatch(/tasks\.matching \{ it\.name ==~ \/createBundle\.\*JsAndAssets\/ \}\.configureEach \{/);
    expect(gradle).toMatch(/inputs\.property\("sentryRelease", System\.getenv\("SENTRY_RELEASE"\) \?: ""\)/);
  });

  test('adds it once, however often the native project is generated', () => {
    expect(addReleaseInput(addReleaseInput(GRADLE))).toBe(addReleaseInput(GRADLE));
  });
});

test('the app config runs the plugin', () => {
  const app = JSON.parse(readFileSync(join(__dirname, '../../app.json'), 'utf8'));
  expect(app.expo.plugins).toContain('./plugins/with-release-in-bundle');
});
