import { planRound, type RoundInputs } from '../round';

const NOW = new Date('2026-11-27T12:00:00Z');
const day = (iso: string) => `${iso}T12:00:00.000Z`;

/** A small world: what's installed, what the registry has, and what Expo pins and wants. */
function inputs(overrides: Partial<RoundInputs> = {}): RoundInputs {
  return {
    deps: [
      { name: 'tldts', installed: '7.4.19', dev: false },
      { name: 'convex', installed: '1.49.0', dev: false },
      { name: '@convex-dev/rate-limiter', installed: '0.3.2', dev: false },
      { name: 'eslint', installed: '9.39.5', dev: true },
      { name: 'react-doctor', installed: '0.9.14', dev: true },
      { name: 'uniwind', installed: '1.13.2', dev: false },
      { name: 'effect', installed: '4.1.2', dev: false },
      { name: 'expo', installed: '58.0.26', dev: false },
      { name: 'react', installed: '19.3.0', dev: false },
      { name: 'expo-router', installed: '58.0.32', dev: false },
      { name: 'react-native-reanimated', installed: '4.8.0', dev: false },
      { name: 'rnsec', installed: '1.3.0', dev: true },
    ],
    registry: {
      tldts: { '7.4.19': day('2026-10-20'), '7.5.2': day('2026-11-13'), '7.6.2': day('2026-11-27') },
      // Ancient versions under the same name must not read as an update (convex had 3.x in 2015).
      convex: { '3.3.3': day('2015-05-01'), '1.49.0': day('2026-10-30'), '1.50.0': day('2026-11-12'), '1.51.0': day('2026-11-18'), '1.52.0-alpha.1': day('2026-11-01') },
      '@convex-dev/rate-limiter': { '0.3.2': day('2025-12-09'), '0.4.3': day('2026-10-29') },
      eslint: { '9.39.5': day('2026-07-10'), '10.14.0': day('2026-10-30'), '10.16.0': day('2026-11-27') },
      'react-doctor': { '0.9.14': day('2026-09-12'), '0.9.23': day('2026-11-13') },
      uniwind: { '1.13.2': day('2026-11-05'), '1.14.0': day('2026-11-17') },
      effect: { '4.1.2': day('2026-11-02'), '4.1.4': day('2026-11-11'), '4.1.7': day('2026-11-27') },
      expo: { '58.0.26': day('2026-11-17'), '58.1.0': day('2026-11-26') },
      react: { '19.3.0': day('2026-09-09'), '19.3.1': day('2026-10-14') },
      'expo-router': { '58.0.32': day('2026-11-17'), '58.0.33': day('2026-11-26') },
      'react-native-reanimated': { '4.7.1': day('2026-10-01'), '4.8.0': day('2026-11-19') },
      rnsec: { '1.3.0': day('2026-04-19'), '1.4.0': day('2026-10-23') },
    },
    sdkPinned: ['expo', 'react', 'expo-router', 'react-native-reanimated'],
    sdkWanted: { expo: '58.1.0', 'expo-router': '58.0.33', 'react-native-reanimated': '4.7.1' },
    excluded: ['react-native-reanimated'],
    patched: ['rnsec'],
    ...overrides,
  };
}

const names = (rows: { name: string }[]) => rows.map((row) => row.name);

// FEE-142: what a dependency round may take on its own, and what it leaves for the owner.
describe('planRound', () => {
  test('a patch or minor update takes the newest version two weeks old, never a newer one', () => {
    const { safe } = planRound(inputs(), NOW);
    expect(safe).toContainEqual(expect.objectContaining({ name: 'tldts', to: '7.5.2', released: '2026-11-13' }));
    expect(safe).toContainEqual(expect.objectContaining({ name: 'effect', to: '4.1.4' }));
  });

  test('ancient versions and prereleases under the same name are no update', () => {
    const { safe, major } = planRound(inputs(), NOW);
    expect(safe).toContainEqual(expect.objectContaining({ name: 'convex', to: '1.50.0' }));
    expect(names(major)).not.toContain('convex');
  });

  test('dev tools move too, in their own group', () => {
    const { dev, safe } = planRound(inputs(), NOW);
    expect(dev).toContainEqual(expect.objectContaining({ name: 'react-doctor', to: '0.9.23' }));
    expect(names(safe)).not.toContain('react-doctor');
  });

  test('a 0.x minor may break, so it is listed for the owner, not taken', () => {
    const { safe, zeroMinor } = planRound(inputs(), NOW);
    expect(zeroMinor).toContainEqual(expect.objectContaining({ name: '@convex-dev/rate-limiter', to: '0.4.3' }));
    expect(names(safe)).not.toContain('@convex-dev/rate-limiter');
  });

  test('a major is listed for its own ticket, at its newest version two weeks old', () => {
    const { major, dev } = planRound(inputs(), NOW);
    expect(major).toContainEqual(expect.objectContaining({ name: 'eslint', to: '10.14.0' }));
    expect(names(dev)).not.toContain('eslint');
  });

  test('a package Expo pins never moves on its own, even when a newer version is old enough', () => {
    const { safe } = planRound(inputs(), NOW);
    expect(names(safe)).not.toContain('react');
    expect(names(safe)).not.toContain('expo-router');
  });

  test('the Expo SDK set waits until every version Expo wants is two weeks old, and says when', () => {
    const { sdk } = planRound(inputs(), NOW);
    expect(sdk.eligible).toBe(false);
    // expo 58.1.0 and expo-router 58.0.33, both released 2026-11-26.
    expect(sdk.eligibleOn).toBe('2026-12-10');
    expect(names(sdk.rows)).toEqual(['expo', 'expo-router', 'react-native-reanimated']);
  });

  test('an exception kept ahead of Expo says so, so the SDK round doesn\'t take it back down', () => {
    const row = planRound(inputs(), NOW).sdk.rows.find((r) => r.name === 'react-native-reanimated');
    expect(row?.note).toMatch(/ahead of Expo on purpose/);
  });

  test('the Expo SDK set is eligible once every wanted version is two weeks old', () => {
    const { sdk } = planRound(inputs(), new Date('2026-12-11T00:00:00Z'));
    expect(sdk.eligible).toBe(true);
  });

  test('an update that is not two weeks old yet says when it will be', () => {
    const { notYet, safe } = planRound(inputs(), NOW);
    expect(notYet).toContainEqual(expect.objectContaining({ name: 'uniwind', to: '1.14.0', eligibleOn: '2026-12-01' }));
    expect(names(safe)).not.toContain('uniwind');
  });

  test('an exception says when its installed version ages in, and is flagged once it has', () => {
    expect(planRound(inputs(), NOW).exceptions).toEqual([
      { name: 'react-native-reanimated', installed: '4.8.0', agesInOn: '2026-12-03', agedIn: false },
    ]);
    expect(planRound(inputs(), new Date('2026-12-04T00:00:00Z')).exceptions[0].agedIn).toBe(true);
  });

  test('a patched package with a newer version is flagged to re-check its patch, and not taken', () => {
    const { patched, dev } = planRound(inputs(), NOW);
    expect(patched).toEqual([{ name: 'rnsec', installed: '1.3.0', to: '1.4.0' }]);
    expect(names(dev)).not.toContain('rnsec');
  });

  test('effect says its vendored source moves with it', () => {
    const effect = planRound(inputs(), NOW).safe.find((row) => row.name === 'effect');
    expect(effect?.note).toMatch(/repos:effect/);
  });

  test('nothing to act on when everything is current', () => {
    const round = planRound(
      inputs({ deps: [{ name: 'tldts', installed: '7.6.2', dev: false }], sdkWanted: {}, excluded: [], patched: [] }),
      NOW,
    );
    expect(round.actionable).toBe(false);
  });
});
