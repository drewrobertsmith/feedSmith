import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '../..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

// Q19: colours and type come only from the theme's tokens.
test.each(sourceFiles(SRC).filter((f) => !f.startsWith(join(SRC, 'theme'))).map((f) => relative(SRC, f)))(
  '%s has no hard-coded colours and no Roboto',
  (file) => {
    const text = readFileSync(join(SRC, file), 'utf8');
    expect(text).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(text).not.toMatch(/roboto/i);
  },
);
