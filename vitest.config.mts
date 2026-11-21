import { defineConfig } from 'vitest/config';

// Convex functions are tested with convex-test on Vitest (the app's tests run on Jest).
export default defineConfig({
  test: {
    include: ['convex/**/*.test.ts'],
    environment: 'edge-runtime',
    server: { deps: { inline: ['convex-test'] } },
  },
});
