import * as fs from 'node:fs/promises';
import { ColorViolation } from './types';
import chalk from 'chalk';

export async function fixViolations(violations: ColorViolation[]): Promise<number> {
  const fixableViolations = violations.filter(v => v.suggestion);
  if (fixableViolations.length === 0) return 0;

  // Group by file
  const byFile = new Map<string, ColorViolation[]>();
  for (const v of fixableViolations) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file)!.push(v);
  }

  let totalFixed = 0;

  for (const [filePath, fileViolations] of byFile) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      // Sort violations for this file (optional, but good for processing order)
      // We will replace occurrences line by line
      for (const v of fileViolations) {
        const lineIndex = v.line - 1;
        if (lineIndex >= 0 && lineIndex < lines.length && v.suggestion) {
          // Replace the exact value with the suggestion on that line
          if (lines[lineIndex].includes(v.value)) {
            lines[lineIndex] = lines[lineIndex].replace(v.value, v.suggestion);
            totalFixed++;
          }
        }
      }

      await fs.writeFile(filePath, lines.join('\n'), 'utf-8');
    } catch (error: any) {
      console.error(chalk.red(`Failed to fix file: ${filePath}`));
      console.error(chalk.dim(`Details: ${error.message}`));
    }
  }

  return totalFixed;
}
