import chalk from 'chalk';
import path from 'node:path';
import { ColorViolation } from '../core/types';

// The per-file header line, shared with color-lint-fix so both print the same styling.
export function formatFileHeader(relativePath: string): string {
  return chalk.underline.blueBright(`📄 ${relativePath}`);
}

// One violation line, shared with color-lint-fix so both print it byte-identically.
export function formatViolationLine(v: ColorViolation): string {
  return (
    chalk.yellow('  ⚠  ') +
    chalk.white(`Line ${v.line}, Col ${v.column}`) +
    chalk.gray('  |  ') +
    chalk.magenta(v.property) +
    chalk.gray(': ') +
    chalk.red.bold(v.value)
  );
}

// Prints all violations to the terminal in a human-readable format.
export function reportViolations(violations: ColorViolation[], targetDir: string): void {
  if (violations.length === 0) return;

  // Groups violations by file so the output is easy to scan.
  const byFile = new Map<string, ColorViolation[]>();
  for (const v of violations) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file)!.push(v);
  }

  // Print each file group
  for (const [file, fileViolations] of byFile) {
    const relativePath = path.relative(targetDir, file);

    console.log('\n' + formatFileHeader(relativePath) + chalk.gray(` (${fileViolations.length} violation${fileViolations.length > 1 ? 's' : ''})`));

    for (const v of fileViolations) {
      console.log(formatViolationLine(v));

      // Only the primary (first) suggestion is named; the rest are summarised as a count.
      if (v.suggestions?.length) {
        const [primary, ...others] = v.suggestions;
        console.log(
          chalk.gray('     Suggestion: ') +
          chalk.green(primary) +
          (others.length ? chalk.gray(` (+${others.length} more)`) : '')
        );
      }
    }
  }
}
