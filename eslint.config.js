// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// A later block's `no-restricted-imports` replaces an earlier one's for the same file, so each block
// lists every restriction that applies to its files, built from these.

/** Vendored source is read, never imported: app code imports the installed packages (T38). */
const NO_REPOS = { group: ['**/repos/**', 'repos/**'], message: 'repos/ is read-only reference (T38): import the installed package instead.' };
/** Effect stays on the server: the app is screens fed by Convex's live queries (T44). */
const NO_EFFECT_PATH = { name: 'effect', message: 'Effect belongs on the server, in convex/lib/ (T44), not in the app.' };
const NO_EFFECT_PATTERN = { group: ['effect/*', '@effect/*'], message: NO_EFFECT_PATH.message };
/** Symbols are drawn by AppSymbol, which sizes the box to the glyph Android grows (D31, FEE-39). */
const NO_BARE_SYMBOL = {
  name: 'expo-symbols',
  importNames: ['SymbolView'],
  message: 'Use AppSymbol from @/components/app-symbol: a bare SymbolView clips at a large Android font size (D31).',
};

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'example/*', 'repos/**', '.agents/*', '.claude/*'],
  },
  {
    files: ['**/*.{ts,tsx,js,mjs,cjs}'],
    rules: { 'no-restricted-imports': ['error', { patterns: [NO_REPOS] }] },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: { 'no-restricted-imports': ['error', { paths: [NO_EFFECT_PATH], patterns: [NO_REPOS, NO_EFFECT_PATTERN] }] },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/components/app-symbol.tsx'],
    rules: {
      'no-restricted-imports': ['error', { paths: [NO_EFFECT_PATH, NO_BARE_SYMBOL], patterns: [NO_REPOS, NO_EFFECT_PATTERN] }],
    },
  },
]);
