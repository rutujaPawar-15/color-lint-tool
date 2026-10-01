#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { scanFile } from './core/scanner';
import { reportViolations, warnTokenFile } from './utils/reporter';
import { findFiles, getChangedFiles, findTokenFiles, resolveSingleFile, resolveTokenFile } from './utils/file-finder';
import { loadVariables, suggestVariable } from './core/variables';
import { ColorViolation } from './core/types';

const program = new Command();

program
  .name('color-lint')
  .description('Detect hardcoded colors, replace them with design tokens, and standardize your codebase.')
  .option('-c, --changed', 'Scan only changed files in the current directory and working tree (staged, unstaged, and untracked). Requires git to be installed and this directory to be a git repository.', false)
  .option('-f, --file <path>', 'Scan only this one file (relative to the current directory, or absolute). It must pass the same rules as a full scan. Cannot be combined with --changed.')
  .option('-t, --tokens <path>', 'Design token file to suggest replacements from. Defaults to every _variables.scss / _variables-new.scss found in the current directory.')
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
      if (options.file && changedOnly) throw new Error('Use either --file or --changed, not both.');

      // 0. Load design tokens (explicit --tokens file, else auto-discovered source-of-truth files).
      //    A broken --tokens file is fatal; a broken discovered one is only a warning.
      const tokens = options.tokens
        ? loadVariables([resolveTokenFile(targetDir, options.tokens)])
        : loadVariables(await findTokenFiles(targetDir), warnTokenFile);

      // 1. Find files to scan (one named file, all matching files, or only those changed in git)
      let files: string[];
      if (options.file) {
        const { file, skipReason } = resolveSingleFile(targetDir, options.file);
        if (skipReason) {
          console.log(chalk.yellow(`Skipped ${options.file}: ${skipReason}.`));
          return;
        }
        files = [file];
      } else {
        files = changedOnly
          ? await getChangedFiles(targetDir)
          : await findFiles(targetDir);
      }

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
      const allViolations: ColorViolation[] = results.flat().map(v => ({
        ...v,
        suggestions: suggestVariable(v.value, tokens),
      }));

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
