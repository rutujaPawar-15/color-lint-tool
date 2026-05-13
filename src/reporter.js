const chalk = require('chalk');
const path = require('path');

/**
 * Print scan results to console
 */
function printResults(results) {
  if (results.totalIssues === 0) {
    return;
  }
  
  console.log(chalk.red.bold(`Found ${results.totalIssues} hard-coded color(s) in ${results.filesWithIssues} file(s):\n`));
  
  // Group issues by file
  const issuesByFile = {};
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
  
  console.log(chalk.red.bold(`\n\nTotal: ${results.totalIssues} issue(s) found`));
}

module.exports = {
  printResults
};