import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Scoped to files that currently have real test coverage — cli.ts/reporter.ts
      // stay out of the gate until they get their own tests. Extend this list as
      // each new src file gets a *.test.ts suite.
      include: ['src/core/scanner.ts', 'src/utils/file-finder.ts'],
      thresholds: { lines: 70, statements: 70, branches: 60, functions: 70 },
    },
  },
});
