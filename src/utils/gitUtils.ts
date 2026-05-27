import { execSync } from 'child_process';
import path from 'path';

/**
 * Check if current directory is a git repository
 */
function isGitRepository(): boolean {
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the default branch name (main or master)
 */
function getDefaultBranch(): string {
  try {
    execSync('git rev-parse --verify main', { stdio: 'ignore' });
    return 'main';
  } catch {
    try {
      execSync('git rev-parse --verify master', { stdio: 'ignore' });
      return 'master';
    } catch {
      // Fallback to main if neither exists (edge case)
      return 'main';
    }
  }
}

/**
 * Get list of staged files
 */
export async function getStagedFiles(): Promise<string[]> {
  try {
    if (!isGitRepository()) {
      console.error('Error: Not a git repository. Cannot get staged files.');
      return [];
    }

    const output = execSync('git diff --cached --name-only', {
      encoding: 'utf-8'
    });

    return output
      .trim()
      .split('\n')
      .filter(f => f.length > 0)
      .map(f => path.resolve(f));

  } catch (error: any) {
    console.error('Error getting staged files:', error.message);
    return [];
  }
}

/**
 * Get list of files changed in current branch compared to main/master
 */
export async function getChangedFiles(): Promise<string[]> {
  try {
    if (!isGitRepository()) {
      console.error('Error: Not a git repository. Use --path option to scan a directory instead.');
      return [];
    }

    const baseBranch = getDefaultBranch();

    // Get changed files
    const output = execSync(`git diff --name-only ${baseBranch}...HEAD`, {
      encoding: 'utf-8'
    });

    const files = output
      .trim()
      .split('\n')
      .filter(f => f.length > 0)
      .map(f => path.resolve(f));

    if (files.length === 0) {
      console.warn(`No files changed compared to ${baseBranch} branch.`);
    }

    return files;

  } catch (error: any) {
    console.error('Error getting git diff:', error.message);
    console.error('Make sure you are in a git repository and have a main/master branch.');
    return [];
  }
}
