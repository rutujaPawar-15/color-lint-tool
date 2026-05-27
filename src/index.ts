#!/usr/bin/env node

import chalk from 'chalk';
import minimist from 'minimist';
import * as scanner from './scanner';
import * as reporter from './reporter';
import type { ScanArgs } from './scanner';

// Combine ScanArgs with the CLI-only 'help' flag type
type CliArgs = ScanArgs & { help?: boolean };

// Parse command line arguments using minimist generics
const args = minimist<CliArgs>(process.argv.slice(2), {
  string: ['path', 'ext'],
  boolean: ['help', 'git-diff'],
  alias: {
    h: 'help',
    p: 'path',
    e: 'ext'
  },
  default: {
    path: process.cwd(),
    ext: '.css,.scss,.sass,.less,.jsx,.tsx,.js,.ts,.vue'
  }
});

// Help message
if (args.help) {
  console.log(`
${chalk.bold('Color Lint Tool - Hard-coded Color Detector')}

${chalk.yellow('Usage:')}
  color-lint [options]

${chalk.yellow('Options:')}
  -p, --path <path>       Path to scan (default: current directory)
  -e, --ext <extensions>  File extensions to scan (default: .css,.scss,.jsx,etc)
  --git-diff              Only scan files changed in current branch
  -h, --help              Show this help message

${chalk.yellow('Examples:')}
  color-lint                           # Scan current directory
  color-lint --path ./src              # Scan specific directory
  color-lint --ext .css,.scss          # Scan only CSS/SCSS files
  color-lint --git-diff                # Scan only changed files in PR
  `);
  process.exit(0);
}

// Main execution
async function main(): Promise<void> {
  // console.log(chalk.bold.blue('\n🎨 Color Lint Tool - Scanning for hard-coded colors...\n'));

  try {
    // Get files to scan
    const filesToScan = await scanner.getFiles(args);

    if (filesToScan.length === 0) {
      // console.log(chalk.yellow('No files found to scan.'));
      process.exit(0);
    }

    // console.log(chalk.gray(`Scanning ${filesToScan.length} files...\n`));

    // Scan files for hard-coded colors
    const results = await scanner.scanFiles(filesToScan);

    // Report results
    reporter.printResults(results);

    // Exit with error code if colors found
    if (results.totalIssues > 0) {
      process.exit(1);
    } else {
      // console.log(chalk.green('\n✓ No hard-coded colors found!'));
      process.exit(0);
    }

  } catch (error: any) {
    // console.error(chalk.red('\n✗ Error:'), error.message);
    process.exit(1);
  }
}

main();