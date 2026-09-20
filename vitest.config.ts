import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    coverage: {
      provider: 'v8',
      include: ['packages/core/src/**', 'packages/geom2d/src/**', 'packages/io-native/src/**'],
      thresholds: { lines: 85 },
    },
  },
});
