import chalk from 'chalk';
import path from 'node:path';
import { ColorViolation } from '../core/types';

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

    console.log(chalk.underline.cyan(`\n📄 ${relativePath}`));

    for (const v of fileViolations) {
      console.log(
        chalk.yellow('  ⚠  ') +
        chalk.white(`Line ${v.line}, Col ${v.column}`) +
        chalk.gray('  |  ') +
        chalk.magenta(v.property) +
        chalk.gray(': ') +
        chalk.red.bold(v.value)
      );
    }
  }
}
