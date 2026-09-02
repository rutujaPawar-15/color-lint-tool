import chalk from 'chalk';
import path from 'node:path';
import { ColorViolation, ScanSuggestion } from '../core/types';

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
    }
  }
}

// Prints violations along with their inline suggested variables.
export function reportViolationsWithSuggestions(
  suggestions: ScanSuggestion[],
  targetDir: string
): void {
  if (suggestions.length === 0) return;

  const byFile = new Map<string, ScanSuggestion[]>();
  for (const s of suggestions) {
    if (!byFile.has(s.file)) byFile.set(s.file, []);
    byFile.get(s.file)!.push(s);
  }

  for (const [file, fileSuggestions] of byFile) {
    const relativePath = path.relative(targetDir, file);

    console.log(chalk.underline.blueBright(`\n📄 ${relativePath}`) + chalk.gray(` (${fileSuggestions.length} violation${fileSuggestions.length > 1 ? 's' : ''})`));

    for (const s of fileSuggestions) {
      console.log(
        chalk.yellow('  ⚠  ') +
        chalk.white(`Line ${s.line}, Col ${s.column}`) +
        chalk.gray('  |  ') +
        chalk.magenta(s.property) +
        chalk.gray(': ') +
        chalk.red.bold(s.value)
      );

      if (s.suggestedVariable) {
        const warning = s.variableMissing
          ? chalk.yellow('  (⚠️  not found in sourceOfTruth files)')
          : '';
        console.log(chalk.green(`     💡 Suggest: ${s.suggestedVariable}`) + warning);
      } else {
        console.log(chalk.yellow(`     ⚠️  No mapping found in colorMap`));
      }
    }
  }
}

