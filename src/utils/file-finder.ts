import fg from 'fast-glob';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { SCAN_CONFIG } from '../core/constants';

// Finds all files in targetDir that match the configured extensions, excluding ignored folders and source-of-truth variable files.
export async function findFiles(targetDir: string): Promise<string[]> {
  const extPattern = SCAN_CONFIG.extensions.map(ext => ext.replace('.', '')).join(',');
  const searchPattern = `**/*.{${extPattern}}`;

  const files = await fg(searchPattern, {
    cwd: targetDir,
    ignore: SCAN_CONFIG.exclude.map(folder => `**/${folder}/**`),
    absolute: true,
  });

  // Filter out source-of-truth files (e.g. _variables.scss). These are where colors are DEFINED, not violated
  return files.filter(file => {
    const fileName = path.basename(file);
    return !SCAN_CONFIG.sourceOfTruth.includes(fileName);
  });
}

// Returns absolute paths of files in the working tree that have been modified (staged, unstaged, or untracked),
// filtered by the same extension / exclude / source-of-truth rules as findFiles.
export async function getChangedFiles(targetDir: string): Promise<string[]> {
  // Each command returns paths relative to the current working directory, one per line.
  // --diff-filter=d excludes deletions so we never try to scan a file that no longer exists.
  const gitCommands = [
    'git diff --name-only --diff-filter=d',           // unstaged modifications
    'git diff --name-only --cached --diff-filter=d',  // staged modifications
    'git ls-files --others --exclude-standard',       // untracked (new) files
  ];

  const changed = new Set<string>();
  try {
    for (const cmd of gitCommands) {
      const out = execSync(cmd, { cwd: targetDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      for (const line of out.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed) changed.add(trimmed);
      }
    }
  } catch (err: any) {
    throw new Error(
      `Could not read changed files via git. Make sure "${targetDir}" is inside a git repository and git is installed.\n${err.stderr?.toString?.() || err.message || err}`
    );
  }

  const allowedExts = new Set(SCAN_CONFIG.extensions.map(e => e.toLowerCase()));
  const excludedFolders = new Set(SCAN_CONFIG.exclude);
  const sourceOfTruth = new Set(SCAN_CONFIG.sourceOfTruth);

  const filtered: string[] = [];
  for (const rel of changed) {
    if (!allowedExts.has(path.extname(rel).toLowerCase())) continue;

    const segments = rel.split(/[\\/]/);
    if (segments.some(seg => excludedFolders.has(seg))) continue;

    if (sourceOfTruth.has(path.basename(rel))) continue;

    const abs = path.resolve(targetDir, rel);
    if (!fs.existsSync(abs)) continue;

    filtered.push(abs);
  }

  return filtered;
}
