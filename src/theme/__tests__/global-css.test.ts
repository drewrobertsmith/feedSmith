import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { themes, type Theme } from '@/theme/tokens';

const css = readFileSync(join(__dirname, '../../global.css'), 'utf8');

/** The declarations inside `@variant <name> { … }`. */
function variantBlock(name: string): Record<string, string> {
  const match = css.match(new RegExp(`@variant ${name}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`global.css has no @variant ${name} block`);
  return Object.fromEntries(
    [...match[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, key, value]) => [key, value.trim()]),
  );
}

const cssVar = (role: keyof Theme) => `--color-${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

describe.each(['dark', 'light'] as const)('global.css %s theme', (name) => {
  const block = variantBlock(name);

  test.each(Object.keys(themes[name]) as (keyof Theme)[])('%s matches the token', (role) => {
    expect(block[cssVar(role)]?.toUpperCase()).toBe(themes[name][role].toUpperCase());
  });

  test('declares no colours the tokens lack', () => {
    const roles = Object.keys(themes[name]).map((r) => cssVar(r as keyof Theme));
    expect(Object.keys(block).filter((k) => k.startsWith('--color-')).sort()).toEqual(roles.sort());
  });
});
