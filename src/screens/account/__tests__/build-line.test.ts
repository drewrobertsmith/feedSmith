import { buildLine } from '@/screens/account/build-line';

const APP = 'com.mediatedreality.feedsmith';

// FEE-140: which build is installed, as the Account sheet's last line says it.
describe('buildLine', () => {
  test.each([
    ['a release, named after its commit', `${APP}@1.0.0+2e5913c`, 'feedSmith 1.0.0 · 2e5913c'],
    ['a release built from uncommitted changes', `${APP}@1.0.0+2e5913c-dirty`, 'feedSmith 1.0.0 · 2e5913c-dirty'],
    ['a release named by its build number', `${APP}@1.2.0+42`, 'feedSmith 1.2.0 · 42'],
  ])('%s shows what follows the + in its Sentry release', (_, release, line) => {
    expect(buildLine({ release, version: '1.0.0', dev: false })).toBe(line);
  });

  test('a development build says dev, since its code drifts from any one commit', () => {
    expect(buildLine({ release: `${APP}@1.0.0+2e5913c-dirty`, version: '1.0.0', dev: true })).toBe('feedSmith 1.0.0 · dev');
  });

  test('with no release name, the version alone', () => {
    expect(buildLine({ release: undefined, version: '1.0.0', dev: false })).toBe('feedSmith 1.0.0');
  });

  test('a release name without a + is the version alone too', () => {
    expect(buildLine({ release: `${APP}@1.0.0`, version: '1.0.0', dev: false })).toBe('feedSmith 1.0.0');
  });
});
