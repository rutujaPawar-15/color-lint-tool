import fg from 'fast-glob';
import path from 'node:path';
import fs from 'node:fs';
import { execSync, execFileSync } from 'node:child_process';
import { SCAN_CONFIG, GIT_CHANGED_FILES_COMMANDS } from '../core/constants';

// Shared fast-glob options: search under targetDir, skip excluded folders, return absolute paths.
function globOptions(targetDir: string): fg.Options {
  return {
    cwd: targetDir,
    ignore: SCAN_CONFIG.exclude.map(folder => `**/${folder}/**`),
    absolute: true,
  };
}

// True when `filePath` resolves to a location inside `dir` (not the dir itself, not an
// ancestor via "..", not a different drive). Used to reject explicit paths that point
// outside the directory the command is run from.
export function isWithinDir(dir: string, filePath: string): boolean {
  const rel = path.relative(path.resolve(dir), path.resolve(filePath));
  return rel.length > 0 && !rel.startsWith('..') && !path.isAbsolute(rel);
}

// The result of resolving user-supplied paths: files that resolved cleanly, plus the inputs
// that pointed outside the directory or matched nothing (so the caller can report them).
export interface ResolvedInputs {
  files: string[];
  outside: string[];  // inputs resolving outside targetDir
  notFound: string[]; // inputs that are neither an existing file nor a matching glob
}

// Resolves user-supplied file paths or globs against targetDir. A literal existing file is
// taken as-is; anything else is expanded as a glob. Inputs that point outside targetDir or
// match no file are reported rather than silently dropped.
export async function resolveInputPaths(targetDir: string, inputs: string[]): Promise<ResolvedInputs> {
  const files = new Set<string>();
  const outside: string[] = [];
  const notFound: string[] = [];

  for (const input of inputs) {
    const abs = path.resolve(targetDir, input);

    // A literal existing file: accept only if it lives inside targetDir.
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      if (isWithinDir(targetDir, abs)) files.add(abs);
      else outside.push(input);
      continue;
    }

    // Otherwise treat it as a glob. If the pattern itself escapes targetDir, flag it.
    if (!isWithinDir(targetDir, abs) && input.includes('..')) {
      outside.push(input);
      continue;
    }

    const matches = await fg(input.replace(/\\/g, '/'), { cwd: targetDir, absolute: true });
    const within = matches.filter((m) => isWithinDir(targetDir, m));
    if (within.length === 0) {
      notFound.push(input);
      continue;
    }
    for (const m of within) files.add(m);
  }

  return { files: [...files], outside, notFound };
}

// Finds all files in targetDir that match the configured extensions, excluding ignored folders and source-of-truth variable files.
export async function findFiles(targetDir: string): Promise<string[]> {
  const extPattern = SCAN_CONFIG.extensions.map(ext => ext.replace('.', '')).join(',');
  const searchPattern = `**/*.{${extPattern}}`;

  const files = await fg(searchPattern, globOptions(targetDir));

  // Filter out source-of-truth files (e.g. _variables.scss). These are where colors are DEFINED, not violated
  return files.filter(file => {
    const fileName = path.basename(file);
    return !SCAN_CONFIG.sourceOfTruth.includes(fileName);
  });
}

// Returns the git repository root containing `cwd`, or null if cwd is not in a git repo.
export function getRepoRoot(cwd: string): string | null {
  try {
    const out = execSync('git rev-parse --show-toplevel', {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

// Resolves which files define the design tokens the tool suggests against.
// If `tokensOption` is given (a path or glob, relative to targetDir or absolute), it is used.
// Otherwise it searches for the source-of-truth variable files (e.g. _variables.scss) across
// the whole git repository (so they are found even when the command runs in a subfolder),
// falling back to targetDir when not in a git repo. Returns absolute paths (may be empty).
export async function resolveTokenSources(targetDir: string, tokensOption?: string): Promise<string[]> {
  if (tokensOption && tokensOption.trim()) {
    const pattern = tokensOption.trim().replace(/\\/g, '/');
    return fg(pattern, globOptions(targetDir));
  }

  const searchBase = getRepoRoot(targetDir) ?? targetDir;
  const names = SCAN_CONFIG.sourceOfTruth.join(',');
  return fg(`**/{${names}}`, globOptions(searchBase));
}

// Returns absolute paths of files in the working tree that have been modified (staged, unstaged, or untracked),
// filtered by the same extension / exclude / source-of-truth rules as findFiles.
export async function getChangedFiles(targetDir: string): Promise<string[]> {
  // Each command returns paths relative to the current working directory, one per line.
  const changed = new Set<string>();
  try {
    for (const cmd of GIT_CHANGED_FILES_COMMANDS) {
      const out = execSync(cmd, { cwd: targetDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      for (const line of out.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed) changed.add(trimmed);
      }
    }
  } catch (err: any) {
    throw new Error(
      `Could not access git repository. Ensure git is installed and this directory is a git repository.\n${err.stderr?.toString?.() || err.message || err}`
    );
  }

  return filterChangedPaths(targetDir, changed);
}

// Applies the scan rules (allowed extension, excluded folder, not a source-of-truth file, still
// exists on disk) to a set of cwd-relative paths, returning the absolute paths that qualify.
// Shared by getChangedFiles (working tree) and getChangedFilesSince (branch vs base).
function filterChangedPaths(targetDir: string, relPaths: Iterable<string>): string[] {
  const allowedExts = new Set(SCAN_CONFIG.extensions.map(e => e.toLowerCase()));
  const excludedFolders = new Set(SCAN_CONFIG.exclude);
  const sourceOfTruth = new Set(SCAN_CONFIG.sourceOfTruth);

  const filtered: string[] = [];
  for (const rel of relPaths) {
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

// Returns absolute paths of files changed on the current branch relative to `base` — i.e. a
// PR's file set, `git diff <base>...HEAD` (three-dot / merge-base, committed changes only) —
// filtered by the same rules as findFiles. Throws a clear error if the base cannot be diffed.
export async function getChangedFilesSince(targetDir: string, base: string): Promise<string[]> {
  let out: string;
  try {
    // execFileSync (no shell) so the branch value is passed as a single argument — avoids
    // shell interpretation of spaces/metacharacters in `base`.
    out = execFileSync('git', ['diff', '--name-only', '--diff-filter=d', '--relative', `${base}...HEAD`], {
      cwd: targetDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err: any) {
    throw new Error(
      `Could not diff against base '${base}'. Ensure the branch exists and this is a git repository.\n${err.stderr?.toString?.() || err.message || err}`
    );
  }

  const changed = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  return filterChangedPaths(targetDir, changed);
}
