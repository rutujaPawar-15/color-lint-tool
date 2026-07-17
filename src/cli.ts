#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { scanFile } from './core/scanner';
import { reportViolations } from './utils/reporter';
import { findFiles, getChangedFiles } from './utils/file-finder';
import { ColorViolation } from './core/types';
import { ColorMap } from './core/color-map';
import { fixViolations } from './core/fixer';

const program = new Command();

program
  .name('color-lint')
  .description('Detect hardcoded colors, replace them with design tokens, and standardize your codebase.')
  .option('-c, --changed', 'Scan only changed files in the current directory and working tree (staged, unstaged, and untracked). Requires git to be installed and this directory to be a git repository.', false)
  .option('-s, --suggest', 'Output suggestions for which CSS variable should be used instead of hardcoded colors', false)
  .option('-f, --fix', 'Automatically replace hardcoded colors with suggested CSS variables', false)
  .action(async (options) => {
    const targetDir = process.cwd();
    const shouldFix = !!options.fix;
    const shouldSuggest = !!options.suggest;
    
    // Automatically enable changed files only mode when --suggest is used
    const changedOnly = !!options.changed || shouldSuggest;

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

      // Build ColorMap
      const colorMap = new ColorMap();
      await colorMap.build(targetDir);

      // 2. Scan every file concurrently and collect all violations
      const results = await Promise.all(files.map(f => scanFile(f, colorMap)));
      const allViolations: ColorViolation[] = results.flat();

      // 3. Print the report
      // If we are auto-fixing, it's often helpful to show suggestions too, 
      // but we strictly follow the suggest flag here.
      reportViolations(allViolations, targetDir, shouldSuggest);

      // 4. Auto-fix if requested
      if (shouldFix && allViolations.length > 0) {
        console.log(chalk.cyan(`\n🔧 Attempting to auto-fix violations...`));
        const fixedCount = await fixViolations(allViolations);
        if (fixedCount > 0) {
          console.log(chalk.green(`✨ Successfully auto-fixed ${fixedCount} violation(s).`));
          // If we fixed everything, we can exit cleanly
          if (fixedCount === allViolations.length) {
            console.log(chalk.green(`\n✅ Scan complete! All violations were fixed.\n`));
            process.exit(0);
          }
        } else {
          console.log(chalk.yellow(`ℹ️ No violations could be automatically fixed (no matching suggestions found).`));
        }
      }

      // 5. Summary + exit code
      if (allViolations.length === 0) {
        console.log(chalk.green(`\n✅ Scan complete! No violations found across ${files.length} file(s).\n`));
      } else {
        console.log(chalk.red(`\n❌ Found ${allViolations.length} violation(s) across ${files.length} file(s).\n`));
        process.exit(1);
      }

    } catch (error: any) {
      console.error(chalk.gray('\nSomething went wrong during the scan. Please try again or check your setup.'));
      console.error(chalk.red('\nFatal Error:'), error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);
