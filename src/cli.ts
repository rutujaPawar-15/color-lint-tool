#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { scanFile } from './core/scanner';
import { reportViolations } from './utils/reporter';
import { findFiles } from './utils/file-finder';
import { ColorViolation } from './core/types';

const program = new Command();

program
  .name('color-lint-check')
  .description('Universal Color Auditor: Scans for hardcoded color values.')
  .action(async () => {
    const targetDir = process.cwd();

    console.log(chalk.bgBlue.white.bold(`\n 🔍 Color Auditor: Scanning ${targetDir} \n`));

    try {
      // 1. Find all files to scan
      const files = await findFiles(targetDir);

      if (files.length === 0) {
        console.log(chalk.yellow('No matching files found in current directory.'));
        return;
      }

      // 2. Scan every file and collect all violations
      const allViolations: ColorViolation[] = [];
      for (const file of files) {
        const violations = await scanFile(file);
        allViolations.push(...violations);
      }

      // 3. Print the report
      reportViolations(allViolations, targetDir);

      // 4. Summary + exit code
      if (allViolations.length === 0) {
        console.log(chalk.green(`\n✔ Scan complete. No violations found across ${files.length} file(s).\n`));
      } else {
        console.log(chalk.red(`\n✖ Found ${allViolations.length} violation(s) across ${files.length} file(s).\n`));
        process.exit(1);
      }

    } catch (error: any) {
      console.error(chalk.red('Fatal Error:'), error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);
