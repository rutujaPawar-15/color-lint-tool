#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { scanFile } from './core/scanner';
import { reportViolations } from './utils/reporter';
import { findFiles, getChangedFiles } from './utils/file-finder';
import { ColorViolation } from './core/types';

const program = new Command();

program
  .name('color-lint')
  .description('Detect hardcoded colors, replace them with design tokens, and standardize your codebase.')
  .option('-c, --changed', 'Scan only changed files in the current directory and working tree (staged, unstaged, and untracked). Requires git to be installed and this directory to be a git repository.', false)
  .action(async (options) => {
    const targetDir = process.cwd();
    const changedOnly: boolean = !!options.changed;

    console.log(chalk.bgBlue.white.bold(
      `\n 🔍 Starting ColorLint Tool...\n`
    ));
    console.log(chalk.cyan(
      changedOnly
        ? `Scanning changed files in ${targetDir}\n`
        : `Scanning ${targetDir}\n`
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
            : 'No matching files found in the current directory.'
        ));
        return;
      }

      // 2. Scan every file concurrently and collect all violations
      const results = await Promise.all(files.map(scanFile));
      const allViolations: ColorViolation[] = results.flat();

      // 3. Print the report
      reportViolations(allViolations, targetDir);

      // 4. Summary + exit code
      if (allViolations.length === 0) {
        console.log(chalk.green(`\n✅ Scan complete! No violations found across ${files.length} file(s).\n`));
      } else {
        console.log(chalk.red(`\n❌ Found ${allViolations.length} violation(s) across ${files.length} file(s).\n`));
        //console.log(chalk.dim('Run with --help to see all available options.\n'));
        process.exit(1);
      }

    } catch (error: any) {
      console.error(chalk.gray('\nSomething went wrong during the scan. Please try again or check your setup.'));
      console.error(chalk.red('\nFatal Error:'), error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);
