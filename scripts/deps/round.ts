/**
 * A dependency round (FEE-142): from what's installed, the registry's release dates and Expo's pins, what may move on
 * its own (patch and minor updates, dev tools) and what's left for the owner. Pure: the CLI (`check.ts`) gathers the
 * inputs. Nothing younger than two weeks is ever offered (T52).
 */

export const MIN_AGE_DAYS = 14;

export type Dep = { name: string; installed: string; dev: boolean };

export type RoundInputs = {
  deps: Dep[];
  /** Each package's versions and their release dates, as the npm registry's `time` gives them. */
  registry: Record<string, Record<string, string>>;
  /** The packages Expo's SDK pins (`expo/bundledNativeModules.json`, and `expo` itself). They move together. */
  sdkPinned: string[];
  /** What `expo install --check` wants instead of what's installed. */
  sdkWanted: Record<string, string>;
  /** `bunfig.toml`'s `minimumReleaseAgeExcludes`: the recorded exceptions. */
  excluded: string[];
  /** `package.json`'s `patchedDependencies`, by package name. */
  patched: string[];
};

export type Move = { name: string; from: string; to: string; released: string; note?: string };

export type Round = {
  /** Patch and minor updates to app dependencies: taken on their own. */
  safe: Move[];
  /** The same for dev tools: taken on their own. */
  dev: Move[];
  /** 0.x minor updates, which may break: listed for the owner. */
  zeroMinor: Move[];
  /** Major updates: each needs its own ticket. */
  major: Move[];
  /** The Expo SDK set: moves together, once every version Expo wants is two weeks old. */
  sdk: { rows: Move[]; eligible: boolean; eligibleOn: string | null };
  /** Updates that exist but aren't two weeks old yet, and when they will be. */
  notYet: (Move & { eligibleOn: string })[];
  exceptions: { name: string; installed: string; agesInOn: string; agedIn: boolean }[];
  patched: { name: string; installed: string; to: string }[];
  /** Whether a round has anything to take or anything for the owner to look at. */
  actionable: boolean;
};

const NOTES: Record<string, string> = { effect: 'then `bun run repos:effect`, so the vendored source matches (T38)' };

type Version = [number, number, number];
const parse = (v: string): Version | null => {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
  return m ? [+m[1], +m[2], +m[3]] : null;
};
const compare = (a: Version, b: Version) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
const date = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (iso: string, days: number) => date(new Date(new Date(iso).getTime() + days * 864e5));

/**
 * The stable versions newer than the one installed, newest first. A version released before the installed one is
 * never newer, whatever its number: `convex` has 3.x versions from 2015 under the same name.
 */
function newer(dep: Dep, times: Record<string, string>) {
  const installed = parse(dep.installed);
  const installedAt = times[dep.installed];
  if (!installed) return [];
  return Object.entries(times)
    .map(([version, at]) => ({ version, at, parsed: parse(version) }))
    .filter((v): v is { version: string; at: string; parsed: Version } => v.parsed !== null)
    .filter((v) => compare(v.parsed, installed) > 0 && (!installedAt || v.at > installedAt))
    .sort((a, b) => compare(b.parsed, a.parsed));
}

export function planRound(inputs: RoundInputs, now: Date): Round {
  const cutoff = new Date(now.getTime() - MIN_AGE_DAYS * 864e5).toISOString();
  const old = (at: string) => at <= cutoff;
  const round: Round = {
    safe: [],
    dev: [],
    zeroMinor: [],
    major: [],
    sdk: { rows: [], eligible: false, eligibleOn: null },
    notYet: [],
    exceptions: [],
    patched: [],
    actionable: false,
  };

  for (const dep of inputs.deps) {
    const times = inputs.registry[dep.name] ?? {};
    const move = (to: string): Move => ({
      name: dep.name,
      from: dep.installed,
      to,
      released: (times[to] ?? '').slice(0, 10),
      ...(NOTES[dep.name] ? { note: NOTES[dep.name] } : {}),
    });

    if (inputs.excluded.includes(dep.name) && times[dep.installed]) {
      const agesInOn = plusDays(times[dep.installed], MIN_AGE_DAYS);
      round.exceptions.push({ name: dep.name, installed: dep.installed, agesInOn, agedIn: date(now) >= agesInOn });
    }

    if (inputs.sdkPinned.includes(dep.name)) {
      const wanted = inputs.sdkWanted[dep.name];
      // An exception kept ahead of Expo on purpose: `expo install --fix` would take it back down.
      const ahead = inputs.excluded.includes(dep.name) && compare(parse(wanted ?? '') ?? [0, 0, 0], parse(dep.installed) ?? [0, 0, 0]) < 0;
      if (wanted) round.sdk.rows.push({ ...move(wanted), ...(ahead ? { note: 'an exception, ahead of Expo on purpose: keep it' } : {}) });
      continue;
    }

    const candidates = newer(dep, times);
    const eligible = candidates.filter((v) => old(v.at));
    if (inputs.patched.includes(dep.name)) {
      if (eligible[0]) round.patched.push({ name: dep.name, installed: dep.installed, to: eligible[0].version });
      continue;
    }

    const installedMajor = parse(dep.installed)![0];
    const sameMajor = eligible.find((v) => v.parsed[0] === installedMajor);
    const higherMajor = eligible.find((v) => v.parsed[0] > installedMajor);
    if (sameMajor) {
      const zeroMinor = installedMajor === 0 && sameMajor.parsed[1] !== parse(dep.installed)![1];
      (zeroMinor ? round.zeroMinor : dep.dev ? round.dev : round.safe).push(move(sameMajor.version));
    }
    if (higherMajor) round.major.push(move(higherMajor.version));
    if (!sameMajor && !higherMajor) {
      const soonest = candidates.filter((v) => v.parsed[0] === installedMajor).at(-1);
      if (soonest) round.notYet.push({ ...move(soonest.version), eligibleOn: plusDays(soonest.at, MIN_AGE_DAYS) });
    }
  }

  // The SDK set moves together, so it waits for its youngest wanted version.
  const wantedDates = round.sdk.rows.map((row) => inputs.registry[row.name]?.[row.to]).filter(Boolean) as string[];
  if (round.sdk.rows.length > 0 && wantedDates.length === round.sdk.rows.length) {
    const youngest = wantedDates.sort().at(-1)!;
    round.sdk.eligibleOn = plusDays(youngest, MIN_AGE_DAYS);
    round.sdk.eligible = old(youngest);
  }

  round.actionable =
    round.safe.length + round.dev.length + round.zeroMinor.length + round.major.length + round.patched.length > 0 ||
    round.sdk.eligible ||
    round.exceptions.some((e) => e.agedIn);
  return round;
}
