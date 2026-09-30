import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Scoped to files that currently have real test coverage. Extend this list as
      // each new src file gets a *.test.ts suite. cli.ts stays out: tests/cli.test.ts
      // runs it in a child process, which v8 coverage of this process cannot see.
      include: [
        'src/core/scanner.ts',
        'src/core/variables.ts',
        'src/utils/file-finder.ts',
        'src/utils/reporter.ts',
      ],
      thresholds: { lines: 70, statements: 70, branches: 60, functions: 70 },
    },
  },
});
