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
      // is not measured here; everything it calls is. The dashboard's pure rules
      // live in the browser but are unit-tested like the rest, so they count too.
      include: [
        'bin/**/*.ts',
        'server/**/*.ts',
        'core/**/*.ts',
        'i18n/**/*.ts',
        'api/**/*.ts',
        'client/dashboard/filter.ts',
        'client/dashboard/sort.ts',
        'client/dashboard/flow.ts',
        'client/lib/roomname.ts',
      ],
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
