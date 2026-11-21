import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '../../..');
const app = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8'));
const plugins: (string | [string, Record<string, unknown>])[] = app.expo.plugins;
const sentry = plugins.find(
  (plugin): plugin is [string, Record<string, unknown>] =>
    Array.isArray(plugin) && plugin[0].startsWith('@sentry/react-native'),
);

// Source maps upload during EAS builds to mediated-reality/feedsmith (FEE-20).
test('the Sentry config plugin names the organization and project', () => {
  expect(sentry?.[1]).toMatchObject({ organization: 'mediated-reality', project: 'feedsmith' });
});

// Q11: the auth token lives only in EAS's environment, never in the repo or the app.
test('the Sentry config plugin carries no auth token', () => {
  expect(JSON.stringify(sentry)).not.toMatch(/token/i);
  expect(readFileSync(join(root, 'app.json'), 'utf8')).not.toMatch(/sntrys_/);
});
