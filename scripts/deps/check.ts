/**
 * `bun run deps:check` (FEE-142): prints this week's dependency round as markdown. With `--apply`, also installs the
 * safe group (patch and minor updates, dev tools) at exact versions; Bun's two-week rule (T52) caps them anyway.
 * It never touches majors, 0.x minors, the Expo SDK set or patched packages: those are listed for the owner.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { planRound, type Dep, type Move, type Round } from './round';

// `bun run deps:check` runs from the repo root.
const root = process.cwd();
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

function installedVersion(name: string, declared: string) {
  const path = join(root, 'node_modules', name, 'package.json');
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')).version as string) : declared.replace(/^[~^]/, '');
}

const deps: Dep[] = [
  ...Object.entries<string>(pkg.dependencies ?? {}).map(([name, v]) => ({ name, installed: installedVersion(name, v), dev: false })),
  ...Object.entries<string>(pkg.devDependencies ?? {}).map(([name, v]) => ({ name, installed: installedVersion(name, v), dev: true })),
];

async function releaseDates(name: string): Promise<Record<string, string>> {
  // A registry that hangs mustn't stall the weekly run: give up after 30 seconds.
  const response = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2F')}`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`npm registry: ${name}: ${response.status}`);
  const { time = {} } = (await response.json()) as { time?: Record<string, string> };
  return time;
}

/** What `expo install --check` wants instead of what's installed: `name@x - expected version: ~y`. */
function expoWanted(): Record<string, string> {
  // It reports on stderr, and exits non-zero when anything is out of date.
  const run = spawnSync('bunx', ['expo', 'install', '--check'], { cwd: root, encoding: 'utf8', env: { ...process.env, CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  const out = `${run.stdout}\n${run.stderr}`;
  const wanted: Record<string, string> = {};
  for (const [, name, version] of out.matchAll(/^\s+(\S+)@\S+ - expected version: [~^]?(\S+)$/gm)) wanted[name] = version;
  return wanted;
}

function bunfigList(key: string): string[] {
  const text = existsSync(join(root, 'bunfig.toml')) ? readFileSync(join(root, 'bunfig.toml'), 'utf8') : '';
  const block = new RegExp(`${key}\\s*=\\s*\\[([^\\]]*)\\]`).exec(text)?.[1] ?? '';
  return [...block.matchAll(/^\s*"([^"]+)"/gm)].map((m) => m[1]);
}

const table = (rows: Move[], extra?: (row: Move) => string) =>
  rows.length === 0
    ? '_None._\n'
    : ['| Package | From | To | Released |' + (extra ? ' |' : ''), '|---|---|---|---|' + (extra ? '---|' : '')]
        .concat(rows.map((r) => `| \`${r.name}\` | ${r.from} | ${r.to} | ${r.released} |${extra ? ` ${extra(r)} |` : ''}`))
        .join('\n') + '\n';

function markdown(round: Round, date: string) {
  const note = (r: Move) => r.note ?? '';
  const sdk = round.sdk.rows.length
    ? `${round.sdk.eligible ? 'Eligible now' : `Not yet: every version Expo wants is two weeks old on **${round.sdk.eligibleOn}**`}. Move it with \`expo install --fix\`.\n\n${table(round.sdk.rows, note)}`
    : '_In line with Expo._\n';
  return [
    `# Dependency round, ${date}`,
    `Two-week rule: nothing newer than ${MIN_DATE(date)} (T52). Moved on its own: patch and minor updates, dev tools. Everything else is for the owner.\n`,
    `## Moved: app dependencies\n\n${table(round.safe, note)}`,
    `## Moved: dev tools\n\n${table(round.dev, note)}`,
    `## For the owner: Expo SDK set\n\n${sdk}`,
    `## For the owner: majors (one ticket each)\n\n${table(round.major)}`,
    `## For the owner: 0.x minors (may break)\n\n${table(round.zeroMinor)}`,
    `## For the owner: patched packages to re-check\n\n${round.patched.length ? round.patched.map((p) => `- \`${p.name}\` ${p.installed} → ${p.to}: is \`patches/${p.name}@${p.installed}.patch\` still needed?`).join('\n') + '\n' : '_None._\n'}`,
    `## Exceptions (\`minimumReleaseAgeExcludes\`)\n\n${round.exceptions.length ? round.exceptions.map((e) => `- \`${e.name}\` ${e.installed}: ${e.agedIn ? `**two weeks old since ${e.agesInOn}: take it out of the list**` : `two weeks old on ${e.agesInOn}`}`).join('\n') + '\n' : '_None._\n'}`,
    `## Not two weeks old yet\n\n${round.notYet.length ? round.notYet.map((m) => `- \`${m.name}\` ${m.from} → ${m.to} on ${m.eligibleOn}`).join('\n') + '\n' : '_None._\n'}`,
  ].join('\n');
}

const MIN_DATE = (date: string) => new Date(new Date(date).getTime() - 14 * 864e5).toISOString().slice(0, 10);

const now = new Date();
const expoPins = JSON.parse(readFileSync(join(root, 'node_modules/expo/bundledNativeModules.json'), 'utf8')) as Record<string, string>;
const registry = Object.fromEntries(await Promise.all(deps.map(async (d) => [d.name, await releaseDates(d.name)] as const)));
const round = planRound(
  {
    deps,
    registry,
    sdkPinned: ['expo', ...Object.keys(expoPins)],
    sdkWanted: expoWanted(),
    excluded: bunfigList('minimumReleaseAgeExcludes'),
    patched: Object.keys(pkg.patchedDependencies ?? {}).map((spec) => spec.slice(0, spec.lastIndexOf('@'))),
  },
  now,
);

console.log(markdown(round, now.toISOString().slice(0, 10)));

if (process.argv.includes('--apply')) {
  const add = (moves: Move[], dev: boolean) => {
    if (moves.length === 0) return;
    execFileSync('bun', ['add', '--exact', ...(dev ? ['--dev'] : []), ...moves.map((m) => `${m.name}@${m.to}`)], { cwd: root, stdio: 'inherit' });
  };
  add(round.safe, false);
  add(round.dev, true);
  if ([...round.safe, ...round.dev].some((m) => m.name === 'effect')) execFileSync('bun', ['run', 'repos:effect'], { cwd: root, stdio: 'inherit' });
}

process.exitCode = round.actionable ? 0 : 3;
