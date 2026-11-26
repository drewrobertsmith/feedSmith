// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'example/*', 'repos/**', '.agents/*', '.claude/*'],
  },
  {
    // Symbols are drawn by AppSymbol, which sizes the box to the glyph Android grows (D31, FEE-39).
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/components/app-symbol.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'expo-symbols',
              importNames: ['SymbolView'],
              message: 'Use AppSymbol from @/components/app-symbol: a bare SymbolView clips at a large Android font size (D31).',
            },
          ],
        },
      ],
    },
  },
]);
