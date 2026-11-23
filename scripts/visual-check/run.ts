/**
 * The visual check (FEE-70): captures every state gallery world on the Android emulator, in dark and light,
 * and compares each with its approved picture.
 *
 *   bun run visual:check [world-id …]      capture and compare (all worlds, or only those named)
 *   bun run visual:approve <world-id …>    approve the last check's pictures of those worlds
 *   bun run visual:approve --all           approve every picture from the last check
 *
 * A check never writes an approved picture. It needs the debug build running against Metro, since the
 * gallery is dev-only (T13). For the run it turns animations off and puts the status bar in demo mode
 * (a fixed clock and battery), and it puts both back afterwards, even when stopped with Ctrl-C. The status
 * bar is cropped off every picture anyway, since other apps' notification icons show there, and so is the
 * right edge, where a scroll indicator sometimes lingers with animations off.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import * as catalog from '../../src/worlds/catalog';
import { compare, crop, halve } from './compare';

const APP = 'com.mediatedreality.feedsmith';
const APPROVED = 'test/visual/approved';
const LATEST = '.visual-check/latest';
const DIFF = '.visual-check/diff';
const THEMES = ['dark', 'light'] as const;
/** The share of pixels that may change before a world counts as different: about one line of anti-aliasing. */
const TOLERANCE = 0.001;
/** Pixels cropped off the right edge, where a scroll indicator sometimes lingers; content keeps its margin clear of it. */
const SCROLL_INDICATOR = 16;
const ANIMATION_SETTINGS = ['animator_duration_scale', 'transition_animation_scale', 'window_animation_scale'];

const WORLD_IDS: string[] = Object.values(catalog).flatMap((worlds) => worlds.map((world) => world.id));
// IDs reach the device's shell (adb joins its arguments into one command) and name files, so they stay plain.
const unsafe = WORLD_IDS.filter((id) => !/^[a-z0-9-]+$/.test(id));
if (unsafe.length) throw new Error(`World IDs must be lowercase letters, digits and dashes: ${unsafe.join(', ')}`);

function adb(args: string[], binary = false): Buffer {
  const result = spawnSync('adb', args, { maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`adb ${args.join(' ')} failed: ${result.stderr.toString()}`);
  return binary ? result.stdout : Buffer.from(result.stdout.toString().trim());
}
const shell = (...args: string[]) => adb(['shell', ...args]).toString();
const demo = (command: string, extras: string[] = []) =>
  shell('am', 'broadcast', '-a', 'com.android.systemui.demo', '-e', 'command', command, ...extras);

/** Turns animations off and fixes the status bar; returns what puts the device back. */
function prepareDevice(): () => void {
  // Read everything first, so whatever happens next, the device can be put back as it was.
  const before = [...ANIMATION_SETTINGS, 'sysui_demo_allowed'].map((name) => [name, shell('settings', 'get', 'global', name)] as const);
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    // Each step on its own, so one that fails doesn't leave the rest changed.
    const steps = [
      () => demo('exit'),
      ...before.map(([name, value]) => () =>
        value === 'null' ? shell('settings', 'delete', 'global', name) : shell('settings', 'put', 'global', name, value),
      ),
    ];
    for (const step of steps) {
      try {
        step();
      } catch (error) {
        console.error(`Couldn't put the device back: ${error instanceof Error ? error.message : error}`);
      }
    }
  };

  try {
    for (const name of ANIMATION_SETTINGS) shell('settings', 'put', 'global', name, '0');
    shell('settings', 'put', 'global', 'sysui_demo_allowed', '1');
    demo('enter');
    demo('clock', ['-e', 'hhmm', '1200']);
    demo('battery', ['-e', 'level', '100', '-e', 'plugged', 'false']);
    demo('network', ['-e', 'wifi', 'show', '-e', 'level', '4']);
    demo('network', ['-e', 'mobile', 'hide']);
    demo('notifications', ['-e', 'visible', 'false']);
  } catch (error) {
    restore();
    throw error;
  }
  return restore;
}

/** Waits, letting a Ctrl-C or kill be handled meanwhile. */
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const screenshot = () => adb(['exec-out', 'screencap', '-p'], true);

/** The status bar's height in pixels, from the window manager. */
function statusBarRows(): number {
  const frame = /type=statusBars[^}]*?frame=\[\d+,\d+\]\[\d+,(\d+)\]/.exec(shell('dumpsys', 'window'));
  if (!frame) throw new Error("Couldn't find the status bar's height in dumpsys window");
  return Number(frame[1]);
}

/** Opens a world and captures it once two screenshots in a row agree, so loading and settling are over. */
async function capture(world: string, theme: string, statusBar: number): Promise<Buffer> {
  const link = `feedsmith://gallery?world=${world}&theme=${theme}&capture=1`;
  shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `'${link}'`, APP);
  let last = screenshot();
  for (let attempt = 0; attempt < 12; attempt++) {
    await pause(attempt === 0 ? 700 : 400);
    const next = screenshot();
    if (next.equals(last)) return halve(crop(next, { top: statusBar, right: SCROLL_INDICATOR }));
    last = next;
  }
  console.warn(`  ${world} (${theme}) never stopped changing; comparing its last frame`);
  return halve(crop(last, { top: statusBar, right: SCROLL_INDICATOR }));
}

async function check(only: string[]) {
  const unknown = only.filter((id) => !WORLD_IDS.includes(id));
  if (unknown.length) throw new Error(`No such world: ${unknown.join(', ')}`);
  const worlds = only.length ? only : WORLD_IDS;
  // Only this check's pictures are left to approve, never an earlier run's.
  rmSync(DIFF, { recursive: true, force: true });
  rmSync(LATEST, { recursive: true, force: true });
  mkdirSync(LATEST, { recursive: true });
  mkdirSync(DIFF, { recursive: true });

  const statusBar = statusBarRows();
  const restore = prepareDevice();
  // A Ctrl-C or kill stops the run after the picture in hand, and `finally` puts the device back.
  let interrupted = false;
  const stop = () => {
    interrupted = true;
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  const report: { name: string; verdict: string }[] = [];
  try {
    for (const world of worlds) {
      for (const theme of THEMES) {
        if (interrupted) break;
        const name = `${world}-${theme}`;
        const picture = await capture(world, theme, statusBar);
        writeFileSync(join(LATEST, `${name}.png`), picture);
        const approvedPath = join(APPROVED, `${name}.png`);
        if (!existsSync(approvedPath)) {
          report.push({ name, verdict: 'new: no approved picture' });
          continue;
        }
        const result = compare(readFileSync(approvedPath), picture);
        if (result.changed > TOLERANCE) {
          writeFileSync(join(DIFF, `${name}.png`), result.diff);
          report.push({
            name,
            verdict: result.sameSize ? `changed: ${(result.changed * 100).toFixed(2)}% of pixels` : 'changed: different size',
          });
        }
        process.stdout.write('.');
      }
    }
  } finally {
    process.off('SIGINT', stop);
    process.off('SIGTERM', stop);
    restore();
  }
  if (interrupted) {
    console.log('\nStopped; the device is back as it was.');
    process.exitCode = 130;
    return;
  }

  const total = worlds.length * THEMES.length;
  console.log(`\n${total - report.length} of ${total} pictures match their approved picture.`);
  for (const { name, verdict } of report) console.log(`  ${name}: ${verdict}`);
  if (report.length) {
    console.log(`\nDifferences (changed pixels in red): ${DIFF}/\nNew pictures: ${LATEST}/`);
    console.log('Approve what you meant to change with: bun run visual:approve <world-id …>');
    process.exitCode = 1;
  }
}

function approve(args: string[]) {
  if (!args.length) throw new Error('Name the worlds to approve, or pass --all.');
  if (!existsSync(LATEST)) throw new Error('Nothing to approve: run bun run visual:check first.');
  const captured = readdirSync(LATEST).filter((file) => file.endsWith('.png'));
  const chosen = args.includes('--all')
    ? captured
    : captured.filter((file) => args.some((id) => THEMES.some((theme) => file === `${id}-${theme}.png`)));
  const missing = args.filter((id) => id !== '--all' && !THEMES.some((theme) => chosen.includes(`${id}-${theme}.png`)));
  if (missing.length) throw new Error(`The last check didn't capture: ${missing.join(', ')}`);
  mkdirSync(APPROVED, { recursive: true });
  for (const file of chosen) copyFileSync(join(LATEST, file), join(APPROVED, file));
  console.log(`Approved ${chosen.length} pictures.`);
}

const [command, ...rest] = process.argv.slice(2);
try {
  if (command === 'check') await check(rest);
  else if (command === 'approve') approve(rest);
  else {
    console.error('Usage: bun scripts/visual-check/run.ts check [world-id …] | approve <world-id …> | approve --all');
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 2;
}
