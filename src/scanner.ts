import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';
import { detectColors, ColorFinding } from './detector';
import { getChangedFiles } from './utils/gitUtils';

export interface ScanArgs {
  path: string;
  ext: string;
  'git-diff'?: boolean;
}

export interface ColorIssue extends ColorFinding {
  file: string;
}

export interface ScanResults {
  totalIssues: number;
  totalFiles: number;
  filesWithIssues: number;
  issues: ColorIssue[];
}

/**
 * Get list of files to scan based on arguments
 */
export async function getFiles(args: ScanArgs): Promise<string[]> {
  let filesToScan: string[] = [];

  if (args['git-diff']) {
    // Get files changed in current branch
    filesToScan = await getChangedFiles();
  } else {
    // Get all files matching extensions
    const extensions = args.ext.split(',').map(e => e.trim());
    const patterns = extensions.map(ext =>
      `${args.path}/**/*${ext}`
    );

    for (const pattern of patterns) {
      const files = await glob(pattern, {
        ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
        absolute: true
      }) as string[];
      filesToScan.push(...files);
    }
  }

  return [...new Set(filesToScan)]; // Remove duplicates
}

/**
 * Scan a single file for hard-coded colors
 */
export async function scanFile(filePath: string): Promise<ColorIssue[]> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const issues: ColorIssue[] = [];

    lines.forEach((line, index) => {
      const findings = detectColors(line, index + 1);
      findings.forEach(finding => {
        issues.push({
          file: filePath,
          ...finding
        });
      });
    });

    return issues;
  } catch (error: any) {
    console.error(`Error reading file ${filePath}:`, error.message);
    return [];
  }
}

/**
 * Scan multiple files
 */
export async function scanFiles(files: string[]): Promise<ScanResults> {
  const allIssues: ColorIssue[] = [];

  for (const file of files) {
    const issues = await scanFile(file);
    allIssues.push(...issues);
  }

  return {
    totalIssues: allIssues.length,
    totalFiles: files.length,
    filesWithIssues: new Set(allIssues.map(i => i.file)).size,
    issues: allIssues
  };
}