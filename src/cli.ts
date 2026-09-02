#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import * as path from 'node:path';
import { scanFile } from './core/scanner';
import { reportViolations, reportViolationsWithSuggestions } from './utils/reporter';
import { findFiles, getChangedFiles } from './utils/file-finder';
import { loadConfig, findConfigFile, type ColorLintConfig } from './core/fixer/config';
import { fixFiles, resolveFixMode, type FixMode, type FixResult } from './core/fixer/fixer';
import { enrichViolationsWithSuggestions } from './core/fixer/suggester';
import { loadDefinedVariables } from './core/fixer/variables';
import { runSetup, SetupCancelledError } from './core/setup/setup';
import { ReadlinePrompter } from './core/setup/prompter';
import { ColorViolation } from './core/types';

// Prints the shared SUMMARY block for dry-run / auto-replace, plus any errors.
// The labels differ per mode (e.g. "Files affected" vs "Files modified").
function printFixSummary(
  result: FixResult,
  labels: { files: string; fileCount: number; replaced: string }
): void {
  console.log(chalk.yellow(`SUMMARY:`));
  console.log(chalk.gray(`  ${labels.files}: ${labels.fileCount}`));
  console.log(chalk.gray(`  Violations found: ${result.violationsFound}`));
  console.log(chalk.gray(`  ${labels.replaced}: ${result.violationsReplaced}`));
  console.log(chalk.gray(`  Skipped (unmapped): ${result.violationsSkipped}\n`));
  if (result.errors.length > 0) {
    console.log(chalk.yellow(`⚠️  Errors:`));
    result.errors.forEach(e => console.log(chalk.gray(`  ${e.file}: ${e.error}`)));
    console.log();
  }
}

function printNoViolations(): void {
  console.log(chalk.green(`\n✅ No violations found!\n`));
}

const program = new Command();

program
  .name('color-lint')
  .description('Detect hardcoded colors, replace them with design tokens, and standardize your codebase.')
  .option('-c, --changed', 'Scan only changed files in the current directory and working tree (staged, unstaged, and untracked). Requires git to be installed and this directory to be a git repository.', false)
  .option('-s, --suggest', 'Enrich scan output with inline variable suggestions from .color-lint-config.json.', false)
  .option('--fix', 'Enable fix mode: suggest or auto-replace hard-coded colors with design tokens. Requires .color-lint-config.json in the project root.', false)
  .option('--suggestions-only', 'With --fix: print recommendations without modifying files.', false)
  .option('--dry-run', 'With --fix: preview changes without writing to disk.', false)
  .action(async (options) => {
    const targetDir = process.cwd();
    const changedOnly: boolean = !!options.changed;
    const enableFix: boolean = !!options.fix;
    const enableSuggest: boolean = !!options.suggest;
    const suggestionsOnly: boolean = !!options.suggestionsOnly;
    const dryRun: boolean = !!options.dryRun;

    console.log(chalk.bgBlue.white.bold(
      `\n 🔍 Starting ColorLint Tool...\n`
    ));

    try {
      // ===== FIX MODE =====
      if (enableFix) {
        if (enableSuggest) {
          console.log(chalk.gray('Note: --suggest is ignored when --fix is active.\n'));
        }

        console.log(chalk.cyan(
          dryRun
            ? `Scanning ${targetDir} with --dry-run (no changes will be written)\n`
            : suggestionsOnly
              ? `Scanning ${targetDir} with suggestions enabled\n`
              : `Scanning ${targetDir} with --fix (auto-replace enabled)\n`
        ));

        // Find and load config file
        const configPath = await findConfigFile(targetDir);
        if (!configPath) {
          console.error(chalk.red('ERROR: ') + '--fix requires a .color-lint-config.json file in the project root or a parent directory.');
          console.error(chalk.gray('Please create one with color→variable mappings. See docs/PRD-fix-feature.md for examples.'));
          process.exit(1);
        }
        let config;
        try {
          config = await loadConfig(configPath);
        } catch (err: any) {
          if (err.code === 'CONFIG_NOT_FOUND') {
            console.error(chalk.red('ERROR: ') + '--fix requires a .color-lint-config.json file in the project root.');
            console.error(chalk.gray('Please create one with color→variable mappings. See docs/PRD-fix-feature.md for examples.'));
          } else if (err.code === 'CONFIG_INVALID_JSON') {
            console.error(chalk.red('ERROR: ') + '.color-lint-config.json is invalid JSON.');
            console.error(chalk.gray(`Details: ${err.message}`));
          } else {
            console.error(chalk.red('ERROR: ') + err.message);
          }
          process.exit(1);
        }

        // Determine fix mode (per PRD §4.3, --dry-run wins if both flags are set)
        const fixMode: FixMode = resolveFixMode(suggestionsOnly, dryRun);

        // Run fixer
        const result = await fixFiles(targetDir, config, {
          mode: fixMode,
          changed: changedOnly,
        });

        // Output based on mode
        if (fixMode === 'suggestions-only') {
          if (result.suggestions && result.suggestions.length > 0) {
            console.log(chalk.yellow(`SUGGESTIONS (${result.violationsFound} violation${result.violationsFound !== 1 ? 's' : ''})\n`));
            for (const suggestion of result.suggestions) {
              console.log(chalk.white(`  ${suggestion.file}:${suggestion.line}`));
              console.log(chalk.gray(`    Property: ${suggestion.property}`));
              console.log(chalk.gray(`    Value: ${suggestion.value}`));
              if (suggestion.suggestedVariable) {
                const missingNote = suggestion.variableMissing
                  ? chalk.yellow('  (⚠️  not found in sourceOfTruth files)')
                  : '';
                console.log(chalk.green(`    → Suggest: ${suggestion.suggestedVariable}`) + missingNote);
              } else {
                console.log(chalk.yellow(`    ⚠️  No mapping found in colorMap`));
              }
              console.log(chalk.gray(
                suggestion.impactOtherFiles > 0
                  ? `    Impact: Also appears in ${suggestion.impactOtherFiles} other file(s)`
                  : `    Impact: First occurrence`
              ));
              console.log();
            }
            console.log(chalk.yellow(`✅ Suggestions complete! Review above and consider adopting these variables.\n`));
          } else {
            printNoViolations();
          }
        } else if (fixMode === 'dry-run') {
          if (result.changes && result.changes.length > 0) {
            console.log(chalk.yellow(`CHANGES PREVIEW (${result.violationsFound} violation${result.violationsFound !== 1 ? 's' : ''}, would replace ${result.violationsReplaced})\n`));
            for (const change of result.changes) {
              console.log(chalk.cyan(`  ${change.file}`));
              // Show each changed line with its line number: the actual before → after.
              for (const diff of change.lineDiffs) {
                console.log(chalk.gray(`    Line ${diff.line}: ${diff.before.trim()}`));
                console.log(chalk.green(`      ✏️  → ${diff.after.trim()}`));
              }
              console.log();
            }
            printFixSummary(result, {
              files: 'Files affected',
              fileCount: result.changes.length,
              replaced: 'Would be replaced',
            });
            console.log(chalk.yellow(`Run without --dry-run to apply changes.\n`));
            console.log(chalk.red(`❌ Would replace ${result.violationsReplaced} violation(s) across ${result.changes.length} file(s).\n`));
            process.exit(1);
          } else {
            printNoViolations();
          }
        } else if (fixMode === 'auto-replace') {
          if (result.violationsFound > 0) {
            console.log(chalk.yellow(`FIXING (${result.violationsReplaced} violation${result.violationsReplaced !== 1 ? 's' : ''} replaced)\n`));
            printFixSummary(result, {
              files: 'Files modified',
              fileCount: result.filesModified,
              replaced: 'Replaced',
            });
            console.log(chalk.gray(`Use git diff to review changes.\n`));
            console.log(chalk.red(`❌ Fixed ${result.violationsReplaced} violation(s) across ${result.filesModified} file(s). Review with git diff.\n`));
            process.exit(1);
          } else {
            printNoViolations();
          }
        }

        return;
      }

      // ===== SCAN MODE (with or without --suggest) =====
      console.log(chalk.cyan(
        changedOnly
          ? (enableSuggest ? `Scanning changed files in ${targetDir} with suggestions enabled\n` : `Scanning changed files in ${targetDir}\n`)
          : (enableSuggest ? `Scanning ${targetDir} with suggestions enabled\n` : `Scanning ${targetDir}\n`)
      ));

      // 1. If --suggest is requested, try to load config (graceful fallback if missing)
      let config: ColorLintConfig | null = null;
      let configMissing = false;
      if (enableSuggest) {
        const configPath = await findConfigFile(targetDir);
        if (configPath) {
          try {
            config = await loadConfig(configPath);
          } catch (err: any) {
            if (err.code === 'CONFIG_INVALID_JSON') {
              console.error(chalk.red('ERROR: ') + '.color-lint-config.json is invalid JSON.');
              console.error(chalk.gray(`Details: ${err.message}`));
              process.exit(1);
            } else {
              console.error(chalk.red('ERROR: ') + err.message);
              process.exit(1);
            }
          }
        } else {
          configMissing = true;
        }
      }

      // 2. Find files to scan (either all matching files, or only those changed in git)
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

      // 3. Scan every file concurrently and collect all violations
      const results = await Promise.all(files.map(scanFile));
      const allViolations: ColorViolation[] = results.flat();

      // 4. Print the report
      if (enableSuggest && config) {
        const definedVariables = await loadDefinedVariables(config.sourceOfTruth);
        const suggestions = enrichViolationsWithSuggestions(allViolations, config, definedVariables);
        reportViolationsWithSuggestions(suggestions, targetDir);

        if (allViolations.length === 0) {
          console.log(chalk.green(`\n✅ Scan complete! No violations found across ${files.length} file(s).\n`));
        } else {
          const suggestedCount = suggestions.filter(s => s.suggestedVariable !== null).length;
          const unmappedCount = suggestions.length - suggestedCount;
          console.log(chalk.red(`\n❌ Found ${allViolations.length} violation(s) across ${files.length} file(s). ${suggestedCount} with suggestions, ${unmappedCount} unmapped.\n`));
          process.exit(1);
        }
      } else {
        reportViolations(allViolations, targetDir);

        if (allViolations.length === 0) {
          console.log(chalk.green(`\n✅ Scan complete! No violations found across ${files.length} file(s).\n`));
        } else {
          console.log(chalk.red(`\n❌ Found ${allViolations.length} violation(s) across ${files.length} file(s).\n`));
          if (enableSuggest && configMissing) {
            console.log(chalk.yellow(`💡 Tip: Create .color-lint-config.json to get variable suggestions. See docs/PRD-fix-feature.md for examples.\n`));
          }
          process.exit(1);
        }
      }

    } catch (error: any) {
      console.error(chalk.gray('\nSomething went wrong. Please try again or check your setup.'));
      console.error(chalk.red('\nFatal Error:'), error.message);
      process.exit(1);
    }
  });

program
  .command('setup')
  .description('Interactively generate .color-lint-config.json by reading your project\'s own variable files.')
  .action(async () => {
    const targetDir = process.cwd();
    console.log(chalk.bgBlue.white.bold(`\n 🎨 ColorLint Setup\n`));

    const prompter = new ReadlinePrompter();
    try {
      const result = await runSetup(targetDir, prompter);

      if (result.status === 'no-variables-found') {
        console.log(chalk.yellow('No color variables found in this project.'));
        console.log(chalk.gray('Define some (e.g. `$color-red: #ff0000;` in a .scss file), then run `color-lint setup` again.\n'));
        return;
      }
      if (result.status === 'aborted') {
        console.log(chalk.yellow('\nSetup cancelled. Your existing config was left unchanged.\n'));
        return;
      }

      console.log(chalk.green(`\n✅ Created ${result.configPath}`));
      console.log(chalk.gray(`   ${result.mappingCount} color→variable mapping(s) written.`));
      if (result.skippedConflicts) {
        console.log(chalk.gray(`   ${result.skippedConflicts} conflicting color(s) left unmapped (flag-only).`));
      }
      console.log(chalk.cyan(`\nNext: run \`color-lint --fix --dry-run\` to preview changes.\n`));
    } catch (error: any) {
      if (error instanceof SetupCancelledError) {
        console.log(chalk.yellow('\nSetup cancelled. No config was written.\n'));
      } else {
        console.error(chalk.red('\nSetup failed:'), error.message);
        process.exitCode = 1;
      }
    } finally {
      await prompter.close();
    }
  });

program.parse(process.argv);

