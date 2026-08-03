import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { findFiles, getChangedFiles } from '../../src/utils/file-finder';

const tmpDirs: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function writeFile(dir: string, relPath: string, content = ''): string {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  return full;
  
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('findFiles', () => {
  it('finds only configured extensions, skipping excluded folders and source-of-truth files', async () => {
    const dir = makeTmpDir('color-lint-findfiles-');

    writeFile(dir, 'src/app.css', '.a { color: #fff; }');
    writeFile(dir, 'styles/theme.less', '.b { color: #000; }');
    writeFile(dir, 'src/app.md', '# not scanned');
    writeFile(dir, 'node_modules/pkg/file.css', '.c { color: #111; }');
    writeFile(dir, 'dist/bundle.css', '.d { color: #222; }');
    writeFile(dir, '_variables.scss', '$a: #333;');

    const files = await findFiles(dir);
    const relFiles = files.map((f) => path.relative(dir, f).split(path.sep).join('/')).sort();

    expect(relFiles).toEqual(['src/app.css', 'styles/theme.less']);
  });
});

describe('getChangedFiles', () => {
  it('returns unstaged-modified, staged, and untracked files, filtered by ext/exclude/source-of-truth', async () => {
    const dir = makeTmpDir('color-lint-changedfiles-');

    execSync('git init -q', { cwd: dir });
    execSync('git config user.email "test@example.com"', { cwd: dir });
    execSync('git config user.name "Test"', { cwd: dir });

    // Committed, then modified without staging -> should show as unstaged-modified.
    const modifiedFile = writeFile(dir, 'modified.css', '.a { color: #fff; }');
    execSync('git add modified.css', { cwd: dir });
    execSync('git commit -q -m "initial"', { cwd: dir });
    fs.writeFileSync(modifiedFile, '.a { color: #000; }', 'utf-8');

    // New file, staged but not committed.
    const stagedFile = writeFile(dir, 'staged.ts', 'const x = "#ff0000";');
    execSync('git add staged.ts', { cwd: dir });

    // New file, never staged (untracked).
    const untrackedFile = writeFile(dir, 'untracked.html', '<div style="color:#fff"></div>');

    // Should all be filtered out despite being untracked changes:
    writeFile(dir, 'dist/bundle.css', '.e { color: #123456; }'); // excluded folder
    writeFile(dir, '_variables.scss', '$a: #333;'); // source of truth
    writeFile(dir, 'notes.md', '# not a scanned extension');

    const files = await getChangedFiles(dir);
    const resolved = new Set(files.map((f) => path.resolve(f)));

    expect(resolved).toEqual(
      new Set([path.resolve(modifiedFile), path.resolve(stagedFile), path.resolve(untrackedFile)])
    );
  });

  it('throws a descriptive error when the directory is not a git repository', async () => {
    const dir = makeTmpDir('color-lint-notgit-');

    await expect(getChangedFiles(dir)).rejects.toThrow(/git repository/i);
  });
});
