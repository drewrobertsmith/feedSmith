import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const CONVEX = join(__dirname, '../../../convex');

function backendFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '_generated' ? [] : backendFiles(path);
    return /\.(ts|tsx|js|mjs)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

/**
 * T26: access tokens last 15 minutes, which is only safe because every backend function finds the
 * caller through its session (`getAuthUserId`, or `requireUserId` on top of it), so a revoked or
 * expired session is refused on the next call. Reading the caller from the token itself would
 * accept a revoked session's token until it expires.
 */
test.each(backendFiles(CONVEX).map((file) => relative(CONVEX, file)))('convex/%s never reads the caller from the token', (file) => {
  expect(readFileSync(join(CONVEX, file), 'utf8')).not.toMatch(/getUserIdentity/);
});

test('the guard sees the files that resolve the caller', () => {
  const files = backendFiles(CONVEX).map((file) => relative(CONVEX, file));
  expect(files).toEqual(expect.arrayContaining(['lib/currentUser.ts', 'users.ts', 'account.ts']));
});
