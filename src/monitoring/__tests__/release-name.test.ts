import { releaseName } from '../../../app.config';

// FEE-135: each build names its Sentry release after the commit it was built from.
describe('releaseName', () => {
  const build = { appId: 'com.mediatedreality.feedsmith', version: '1.0.0', sha: '8755b7c' };

  test('a clean build is the app id, version and short commit', () => {
    expect(releaseName({ ...build, dirty: false })).toBe('com.mediatedreality.feedsmith@1.0.0+8755b7c');
  });

  test('a build with uncommitted changes says so', () => {
    expect(releaseName({ ...build, dirty: true })).toBe('com.mediatedreality.feedsmith@1.0.0+8755b7c-dirty');
  });
});
