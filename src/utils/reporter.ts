import chalk from 'chalk';
import path from 'node:path';
import { ColorViolation } from '../core/types';

// Prefix for the suggestion line, aligned under the violation.
const ARROW_PREFIX = '     → ';

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

    console.log(chalk.underline.blueBright(`\n📄 ${relativePath}`) + chalk.gray(` (${fileViolations.length} violation${fileViolations.length > 1 ? 's' : ''})`));

    for (const v of fileViolations) {
      console.log(
        chalk.yellow('  ⚠  ') +
        chalk.white(`Line ${v.line}, Col ${v.column}`) +
        chalk.gray('  |  ') +
        chalk.magenta(v.property) +
        chalk.gray(': ') +
        chalk.red.bold(v.value)
      );

      // When one or more tokens match this color, show the first suggestion. If more
      // tokens also match, summarize the rest as "(+N more)" rather than listing them
      // all, so output stays readable even when a common color maps to many tokens.
      if (v.suggestions && v.suggestions.length > 0) {
        const [first, ...rest] = v.suggestions;
        const more = rest.length > 0 ? chalk.gray(` (+${rest.length} more)`) : '';
        console.log(chalk.gray(ARROW_PREFIX) + chalk.green(first) + more);
      }
    }
  }
}
