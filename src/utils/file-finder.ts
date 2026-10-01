import fg from 'fast-glob';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { SCAN_CONFIG, GIT_CHANGED_FILES_COMMANDS, GIT_REPO_ROOT_COMMAND } from '../core/constants';

// fast-glob ignore patterns for SCAN_CONFIG.exclude, shared by findFiles and findTokenFiles.
const EXCLUDE_GLOBS = SCAN_CONFIG.exclude.map(folder => `**/${folder}/**`);

// Finds all files in targetDir that match the configured extensions, excluding ignored folders and source-of-truth variable files.
export async function findFiles(targetDir: string): Promise<string[]> {
  const extPattern = SCAN_CONFIG.extensions.map(ext => ext.replace('.', '')).join(',');
  const searchPattern = `**/*.{${extPattern}}`;

  const files = await fg(searchPattern, {
    cwd: targetDir,
    ignore: EXCLUDE_GLOBS,
    absolute: true,
  });

  // Filter out source-of-truth files (e.g. _variables.scss). These are where colors are DEFINED, not violated
  return files.filter(file => {
    const fileName = path.basename(file);
    return !SCAN_CONFIG.sourceOfTruth.includes(fileName);
  });
}

// Finds the design-token files (SCAN_CONFIG.sourceOfTruth basenames) anywhere in targetDir's git repository,
// or in targetDir itself when there is no repo, excluding ignored folders.
export async function findTokenFiles(targetDir: string): Promise<string[]> {
  const files = await fg(SCAN_CONFIG.sourceOfTruth.map(name => `**/${name}`), {
    cwd: repoRoot(targetDir) ?? targetDir,
    ignore: EXCLUDE_GLOBS,
    absolute: true,
  });

  // Sorted so tokens merge in a deterministic order across runs and platforms
  return files.sort();
}

// Why a cwd-relative path is refused by the extension / exclude / source-of-truth rules, or null if it
// passes them. Shared by getChangedFiles and resolveSingleFile so the rules exist once outside fast-glob.
function skipReason(rel: string): string | null {
  if (!SCAN_CONFIG.extensions.includes(path.extname(rel).toLowerCase())) return 'not a scannable file type';
  if (rel.split(/[\\/]/).some(seg => SCAN_CONFIG.exclude.includes(seg))) return 'inside an excluded folder';
  if (SCAN_CONFIG.sourceOfTruth.includes(path.basename(rel))) return 'source-of-truth token file';
  return null;
}

// Whether a path.relative() result leaves its base folder. An absolute result means another drive.
function escapes(rel: string): boolean {
  return rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel);
}

export interface SingleFile {
  file: string;              // absolute path
  skipReason: string | null; // why the discovery rules refuse it, or null to scan it
}

// Resolves one user-named file (relative to targetDir, or absolute) and checks it against the same rules
// as discovery. Throws if it resolves outside targetDir (checked first), does not exist, or is not a file.
export function resolveSingleFile(targetDir: string, file: string): SingleFile {
  const abs = path.resolve(targetDir, file);
  const rel = path.relative(targetDir, abs);
  // Judged on the resolved location, so `../proj/a.scss` from inside proj/ is fine.
  if (escapes(rel)) {
    throw new Error(`File is outside the current directory: ${file}`);
  }
  if (!fs.existsSync(abs)) throw new Error(`File not found: ${file}`);
  if (!fs.statSync(abs).isFile()) throw new Error(`Not a file: ${file}`);
  return { file: abs, skipReason: skipReason(rel) };
}

// The git repository root containing dir, or null when dir is not in a repo (or git is unavailable).
function repoRoot(dir: string): string | null {
  try {
    return execSync(GIT_REPO_ROOT_COMMAND, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

// One spelling of a path that may not exist: realpath of its nearest existing ancestor, plus the rest.
// Needed on Windows, where os.tmpdir() / cwd can be 8.3 short names but git reports long ones.
function canonical(p: string): string {
  const rest: string[] = [];
  let existing = p;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) return p;
    rest.unshift(path.basename(existing));
    existing = parent;
  }
  return path.join(fs.realpathSync.native(existing), ...rest);
}

// Resolves a -t/--tokens path against targetDir and checks it stays inside targetDir's git repository,
// or inside targetDir itself when there is no repo. Throws before any existence check, which is left to
// loadVariables(). Returns the absolute path.
export function resolveTokenFile(targetDir: string, tokensPath: string): string {
  const abs = path.resolve(targetDir, tokensPath);
  const root = repoRoot(targetDir);
  if (escapes(path.relative(canonical(root ?? targetDir), canonical(abs)))) {
    throw new Error(`Token file is outside the ${root ? 'repository' : 'current directory'}: ${tokensPath}`);
  }
  return abs;
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

  const filtered: string[] = [];
  for (const rel of changed) {
    if (skipReason(rel)) continue;

    const abs = path.resolve(targetDir, rel);
    if (!fs.existsSync(abs)) continue;

    filtered.push(abs);
  }

  return filtered;
}
