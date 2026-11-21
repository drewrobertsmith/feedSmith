import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { spacing } from '@/theme/spacing';

const SRC = join(__dirname, '../..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

describe('the spacing scale (D9)', () => {
  test('is named by relationship, and closer means more related', () => {
    expect(spacing).toEqual({ inside: 4, related: 8, group: 16, section: 32, edge: 16 });
    expect(spacing.inside).toBeLessThan(spacing.related);
    expect(spacing.related).toBeLessThan(spacing.group);
    expect(spacing.group).toBeLessThan(spacing.section);
  });

  test('sits on the 8-point grid, with 4 only inside one element', () => {
    const { inside, ...between } = spacing;
    expect(inside).toBe(4);
    for (const value of Object.values(between)) expect(value % 8).toBe(0);
  });

  test('global.css declares the same steps for Uniwind', () => {
    const css = readFileSync(join(SRC, 'global.css'), 'utf8');
    const declared = Object.fromEntries(
      [...css.matchAll(/--spacing-([\w-]+)\s*:\s*(\d+)px\s*;/g)].map(([, name, px]) => [name, Number(px)]),
    );
    expect(declared).toEqual(spacing);
  });
});

// Q24: every space in the app comes from the scale. Google's own sign-in button follows
// Google's branding guidelines instead (D10), so its spec file is exempt.
const EXEMPT = new Set(['theme/google.ts']);
const SPACING_CLASS = /\b-?(?:gap|gap-x|gap-y|space-x|space-y|p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|inset|top|bottom|left|right)-([\w[\].]+)/g;
const NAMES = new Set([...Object.keys(spacing), '0', 'auto', 'px']);

test.each(sourceFiles(SRC).map((f) => relative(SRC, f)).filter((f) => !EXEMPT.has(f)))('%s spaces only on the scale', (file) => {
  const text = readFileSync(join(SRC, file), 'utf8');

  const classNames = [...text.matchAll(/className=(?:"([^"]*)"|\{[^}]*?'([^']*)'[^}]*?'([^']*)'[^}]*\})/g)]
    .flatMap((m) => m.slice(1).filter(Boolean))
    .join(' ');
  const offScale = [...classNames.matchAll(SPACING_CLASS)].map(([cls, value]) => ({ cls, value }));
  expect(offScale.filter(({ value }) => !NAMES.has(value)).map(({ cls }) => cls)).toEqual([]);

  // Style objects: padding, margin and gap take a spacing token, never a bare number.
  const bareNumbers = text.match(/\b(?:padding|margin|gap|rowGap|columnGap)\w*\s*:\s*[^,}\n]*\b\d+\b/g) ?? [];
  expect(bareNumbers).toEqual([]);
});
