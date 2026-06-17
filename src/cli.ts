#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { scanFile } from './core/scanner';
import { reportViolations } from './utils/reporter';
import { findFiles, getChangedFiles } from './utils/file-finder';
import { ColorViolation } from './core/types';

const program = new Command();

program
  .name('color-lint-check')
  .description('Universal Color Auditor: Scans for hardcoded color values.')
  .option('-c, --changed', 'Only scan files changed in the working tree (staged, unstaged, and untracked)', false)
  .action(async (options) => {
    const targetDir = process.cwd();
    const changedOnly: boolean = !!options.changed;

    console.log(chalk.bgBlue.white.bold(
      changedOnly
        ? `\n 🔍 Color Auditor: Scanning changed files in ${targetDir} \n`
        : `\n 🔍 Color Auditor: Scanning ${targetDir} \n`
    ));

    try {
      // 1. Find files to scan (either all matching files, or only those changed in git)
      const files = changedOnly
        ? await getChangedFiles(targetDir)
        : await findFiles(targetDir);

      if (files.length === 0) {
        console.log(chalk.yellow(
          changedOnly
            ? 'No changed files to scan.'
            : 'No matching files found in current directory.'
        ));
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
