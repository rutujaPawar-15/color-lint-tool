import { execSync } from 'child_process';
import path from 'path';

/**
 * Get list of files changed in current branch compared to main/master
 */
export async function getChangedFiles(): Promise<string[]> {
  try {
    // Get the default branch name (main or master)
    let baseBranch = 'main';
    try {
      execSync('git rev-parse --verify main', { stdio: 'ignore' });
    } catch {
      baseBranch = 'master';
    }

    // Get changed files
    const output = execSync(`git diff --name-only ${baseBranch}...HEAD`, {
      encoding: 'utf-8'
    });

    return output
      .trim()
      .split('\n')
      .filter(f => f.length > 0)
      .map(f => path.resolve(f));

  } catch (error: any) {
    console.error('Error getting git diff:', error.message);
    return [];
  }
}
