#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import path from 'node:path';
import { scanFile } from './core/scanner';
import { reportViolations } from './utils/reporter';
import { findFiles, getChangedFiles, getChangedFilesSince, resolveTokenSources, resolveInputPaths, isWithinDir } from './utils/file-finder';
import { TokenMap } from './core/token-map';
import { fixFile } from './core/fixer';
import { createPromptResolver } from './utils/prompt';
import { ColorViolation } from './core/types';

// File extensions that `fix` will rewrite. Other scanned types (.html/.ts/.js) are still
// reported by the scan command but are never auto-fixed.
const FIXABLE_EXTENSIONS = ['.css', '.scss'];

const program = new Command();

program
  .name('color-lint')
  .description('Detect hardcoded colors, replace them with design tokens, and standardize your codebase.')
  .option('-c, --changed', 'Scan only changed files in the current directory and working tree (staged, unstaged, and untracked). Requires git to be installed and this directory to be a git repository.', false)
  .option('-b, --base <branch>', "Scan only files changed on the current branch relative to <branch> (a PR's files: git diff <branch>...HEAD). Mutually exclusive with --changed.")
  .option('-t, --tokens <path>', 'Path or glob to the file(s) that define your color design tokens. Defaults to source-of-truth variable files (e.g. _variables.scss) found in the directory.')
  .action(async (options) => {
    const targetDir = process.cwd();
    const changedOnly: boolean = !!options.changed;
    const baseBranch: string | undefined = options.base;
    const tokensOption: string | undefined = options.tokens;

    if (baseBranch && changedOnly) {
      console.error(chalk.red('Error: --base and --changed cannot be used together. Pick one.'));
      process.exit(1);
    }

    console.log(chalk.bgBlue.white.bold(
      `\n 🔍 Starting ColorLint Tool...\n`
    ));
    console.log(chalk.cyan(
      baseBranch
        ? `Scanning files changed vs ${baseBranch} in ${targetDir}\n`
        : changedOnly
          ? `Scanning changed files in ${targetDir}\n`
          : `Scanning ${targetDir}\n`
    ));

    try {
      // 1. Find files to scan: PR diff vs a base branch, working-tree changes, or everything.
      const files = baseBranch
        ? await getChangedFilesSince(targetDir, baseBranch)
        : changedOnly
          ? await getChangedFiles(targetDir)
          : await findFiles(targetDir);

      if (files.length === 0) {
        console.log(chalk.yellow(
          baseBranch
            ? `No changed files vs ${baseBranch} to scan.`
            : changedOnly
              ? 'No changed files to scan.'
              : 'No matching files found in the current directory.'
        ));
        return;
      }

      // 2. Scan every file concurrently and collect all violations
      const results = await Promise.all(files.map(scanFile));
      const allViolations: ColorViolation[] = results.flat();

      // 3. Build the token map and attach a suggested variable to each violation.
      const tokenFiles = await resolveTokenSources(targetDir, tokensOption);
      if (tokenFiles.length === 0) {
        console.log(chalk.yellow(
          'No design-token source found in the repository (looked for _variables.scss / _variables-new.scss). ' +
          'Pass --tokens <path> to enable variable suggestions.\n'
        ));
      }
      const tokenMap = await TokenMap.build(tokenFiles);
      for (const v of allViolations) {
        v.suggestions = tokenMap.getSuggestions(v.value);
      }

      // 4. Print the report
      reportViolations(allViolations, targetDir);

      // 5. Summary + exit code
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

program
  .command('fix')
  .description('Replace hardcoded colors in CSS/SCSS files with their design tokens. Prompts when a color maps to more than one token.')
  .argument('[paths...]', 'Specific file(s) or glob(s) to fix. Defaults to all CSS/SCSS files in the directory.')
  .option('-c, --changed', 'Fix only changed files (staged, unstaged, and untracked). Requires a git repository. Ignored when explicit paths are given.', false)
  .option('-b, --base <branch>', "Fix only files changed on the current branch relative to <branch> (a PR's files). Mutually exclusive with --changed; ignored when explicit paths are given.")
  .option('-t, --tokens <path>', 'Path or glob to the file(s) that define your color design tokens. Defaults to source-of-truth variable files (e.g. _variables.scss) found in the directory.')
  .option('--dry-run', 'Preview what would change without writing files or prompting.', false)
  .action(async (paths: string[], _options, command) => {
    const targetDir = process.cwd();
    // Read options with globals: because the root program also declares --changed, --base and
    // --tokens, Commander attributes those flags to the parent when they appear after the
    // `fix` subcommand, so the subcommand's local opts would miss them. optsWithGlobals
    // merges both so the flags work regardless of where Commander parsed them.
    const options = command.optsWithGlobals();
    const changedOnly: boolean = !!options.changed;
    const baseBranch: string | undefined = options.base;
    const dryRun: boolean = !!options.dryRun;
    const tokensOption: string | undefined = options.tokens;
    const hasExplicitPaths = paths.length > 0;

    if (!hasExplicitPaths && baseBranch && changedOnly) {
      console.error(chalk.red('Error: --base and --changed cannot be used together. Pick one.'));
      process.exit(1);
    }

    console.log(chalk.bgBlue.white.bold(`\n 🛠  ColorLint Fix${dryRun ? ' (dry run)' : ''}...\n`));

    try {
      // 0. Resolve and validate explicit paths FIRST, so a bad path is reported clearly
      //    (not masked by a later "no token source" message). Paths must be inside the
      //    current directory and must actually exist.
      let explicitFiles: string[] = [];
      if (hasExplicitPaths) {
        const resolved = await resolveInputPaths(targetDir, paths);
        if (resolved.outside.length > 0 || resolved.notFound.length > 0) {
          if (resolved.outside.length > 0) {
            console.error(chalk.red('Error: these path(s) are outside the current directory and cannot be fixed:'));
            for (const p of resolved.outside) console.error(chalk.red(`  ${p}`));
          }
          if (resolved.notFound.length > 0) {
            console.error(chalk.red('Error: these path(s) do not exist in the current directory:'));
            for (const p of resolved.notFound) console.error(chalk.red(`  ${p}`));
          }
          console.error(chalk.gray(`\nRun 'color-lint fix' from the directory that contains the file, and pass a path inside:\n  ${targetDir}\n`));
          process.exit(1);
        }
        explicitFiles = resolved.files;
      }

      // 1. Build the token map (required — nothing to fix against without it).
      const tokenFiles = await resolveTokenSources(targetDir, tokensOption);
      if (tokenFiles.length === 0) {
        console.log(chalk.yellow(
          'No design-token source found in the repository (looked for _variables.scss / _variables-new.scss). ' +
          'Pass --tokens <path> to enable fixes.\n'
        ));
        return;
      }
      const tokenMap = await TokenMap.build(tokenFiles);

      // 2. Choose candidate files: explicit paths (if given) take precedence over --changed
      //    and the default full scan. Keep only CSS/SCSS files, and never rewrite a token
      //    source file itself (doing so would replace a token's own value with its name,
      //    e.g. "$focus: #bbcddb" → "$focus: $focus", corrupting the source of truth).
      const tokenFileSet = new Set(tokenFiles.map(f => path.resolve(f)));
      const allFiles = hasExplicitPaths
        ? explicitFiles
        : baseBranch
          ? await getChangedFilesSince(targetDir, baseBranch)
          : changedOnly
            ? await getChangedFiles(targetDir)
            : await findFiles(targetDir);
      const files = allFiles.filter(f =>
        FIXABLE_EXTENSIONS.includes(path.extname(f).toLowerCase()) &&
        !tokenFileSet.has(path.resolve(f))
      );

      if (files.length === 0) {
        console.log(chalk.yellow(
          hasExplicitPaths
            ? 'Nothing to fix in the given path(s) — they are either not .css/.scss files or are token-definition files.'
            : 'No CSS/SCSS files to fix.'
        ));
        return;
      }

      // 3. Fix each file. Ambiguous colors are resolved interactively (skipped on dry-run).
      const resolve = dryRun ? () => null : createPromptResolver(targetDir);
      let fixedCount = 0;
      let ambiguousCount = 0;
      let filesChanged = 0;

      for (const file of files) {
        const result = await fixFile(file, tokenMap, resolve, { dryRun });
        if (result.applied.length === 0 && result.unresolved.length === 0) continue;

        const rel = path.relative(targetDir, file);
        console.log(chalk.underline.blueBright(`\n📄 ${rel}`));
        for (const fix of result.applied) {
          console.log(chalk.gray(`  Line ${fix.line}  `) + chalk.red(fix.from) + chalk.gray(' → ') + chalk.green(fix.to));
        }
        for (const u of result.unresolved) {
          const note = u.reason === 'ambiguous'
            ? 'multiple tokens — ' + (dryRun ? 'would prompt' : 'skipped')
            : 'token exists but not valid in this file type';
          console.log(chalk.gray(`  Line ${u.line}  `) + chalk.red(u.value) + chalk.yellow(`  (${note})`));
        }

        fixedCount += result.applied.length;
        ambiguousCount += result.unresolved.filter(u => u.reason === 'ambiguous').length;
        if (result.changed && !dryRun) filesChanged++;
      }

      // 4. Summary.
      if (fixedCount === 0 && ambiguousCount === 0) {
        console.log(chalk.green('\n✅ Nothing to fix.\n'));
      } else if (dryRun) {
        console.log(chalk.cyan(`\nDry run: ${fixedCount} replacement(s) would be applied` +
          (ambiguousCount ? `, ${ambiguousCount} ambiguous color(s) would prompt` : '') + '. No files written.\n'));
      } else {
        console.log(chalk.green(`\n✅ Applied ${fixedCount} replacement(s) across ${filesChanged} file(s).` +
          (ambiguousCount ? chalk.yellow(` ${ambiguousCount} left unresolved.`) : '') + '\n'));
      }
    } catch (error: any) {
      console.error(chalk.gray('\nSomething went wrong during the fix. Please try again or check your setup.'));
      console.error(chalk.red('\nFatal Error:'), error.message);
      process.exit(1);
    }
  });

program.parse(process.argv);
