import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '.reports/coverage',
      reporter: ['text', 'json', 'html', 'cobertura'],
      exclude: ['node_modules/', 'dist/', '_legacy/', 'tests/', 'src/types/**', '*.config.js', '*.config.ts' ],
      thresholds: {
        global: { lines: 70, functions: 70, branches: 65, statements: 70 },
      },
    },
    reporters: ['default', 'junit'],
    outputFile: {
      junit: '.reports/junit.xml',
    }
  },
});
