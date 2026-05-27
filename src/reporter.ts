import chalk from 'chalk';
import path from 'path';
import { ScanResults, ColorIssue } from './scanner';

/**
 * Print scan results to console
 */
export function printResults(results: ScanResults): void {
  if (results.totalIssues === 0) {
    return;
  }

  console.log(chalk.red.bold(`Found ${results.totalIssues} hard-coded color(s) in ${results.filesWithIssues} file(s):\n`));

  // Group issues by file
  const issuesByFile: Record<string, ColorIssue[]> = {};
  results.issues.forEach(issue => {
    if (!issuesByFile[issue.file]) {
      issuesByFile[issue.file] = [];
    }
    issuesByFile[issue.file].push(issue);
  });

  // Print each file's issues
  Object.entries(issuesByFile).forEach(([file, issues]) => {
    const relativePath = path.relative(process.cwd(), file);
     console.log(chalk.underline.cyan(`\n${relativePath}`));

    issues.forEach(issue => {
      const location = `${issue.line}:${issue.column}`;
       console.log(chalk.gray(`  ${location}`));
       console.log(`    ${issue.lineContent}`);
       console.log(chalk.yellow(`    ${' '.repeat(issue.column)}${'~'.repeat(issue.color.length)} ${issue.type}: ${issue.color}`));
    });
  });

  // console.log(chalk.red.bold(`\n\nTotal: ${results.totalIssues} issue(s) found`));
}