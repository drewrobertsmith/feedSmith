import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { palette } from '@/theme/tokens';

// Q19: colours in the app config (splash, icon background, window background) are brand tokens.
const config = readFileSync(join(__dirname, '../../../app.json'), 'utf8');
const colours = [...config.matchAll(/#[0-9a-fA-F]{6}\b/g)].map(([hex]) => hex.toUpperCase());
const brand = Object.values(palette).map((hex) => hex.toUpperCase());

test('app.json sets its colours', () => {
  expect(colours.length).toBeGreaterThan(0);
});

test.each(colours)('%s in app.json is a brand token', (hex) => {
  expect(brand).toContain(hex);
});
