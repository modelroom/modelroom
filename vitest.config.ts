import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.{ts,mjs}'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // The CLI entry is a script the e2e pass drives in a child process, so it
      // is not measured here; everything it calls is.
      include: ['bin/**/*.ts', 'server/**/*.ts', 'core/**/*.ts', 'i18n/**/*.ts', 'api/**/*.ts'],
      exclude: ['bin/modelroom.ts', 'server/artifact.ts'],
      thresholds: {
        statements: 75,
        branches: 65,
        functions: 80,
        lines: 75,
      },
    },
  },
});
