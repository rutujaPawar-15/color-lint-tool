import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { findFiles, getChangedFiles } from '../src/utils/file-finder';

function write(dir: string, rel: string, content = ''): void {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function initGitRepo(dir: string): void {
  execSync('git init', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email "test@example.com"', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'ignore' });
}

function relPaths(files: string[], root: string): string[] {
  return files.map((f) => path.relative(root, f).split(path.sep).join('/')).sort();
}

// findFiles filters via fast-glob's `ignore` patterns; getChangedFiles filters via
// manual path-segment string checks (src/utils/file-finder.ts:50-55). Both are
// meant to apply the same three rules — allowed extensions, excluded folders,
// source-of-truth filenames — through two independent code paths that could
// silently diverge if SCAN_CONFIG changes. This suite is what would catch that.
describe('findFiles vs getChangedFiles parity', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'color-lint-parity-'));
    initGitRepo(tmp);
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('findFiles: returns only allowed-extension files, excludes ignored folders and source-of-truth filenames', async () => {
    write(tmp, 'a.css', 'a{}');
    write(tmp, 'b.scss', '$x:1;');
    write(tmp, 'c.html', '<p></p>');
    write(tmp, 'd.ts', 'const x=1;');
    write(tmp, 'e.js', 'const x=1;');
    write(tmp, 'f.json', '{}'); // disallowed extension
    write(tmp, 'dist/g.css', 'g{}'); // excluded folder
    write(tmp, '_variables.scss', '$y:2;'); // source-of-truth
    write(tmp, '_variables-new.scss', '$z:3;'); // source-of-truth (second filename)

    const result = await findFiles(tmp);

    expect(relPaths(result, tmp)).toEqual(['a.css', 'b.scss', 'c.html', 'd.ts', 'e.js']);
  });

  it('getChangedFiles: applies the same three rules across unstaged, staged, and untracked files', async () => {
    write(tmp, 'a.css', 'a{}');
    write(tmp, 'dist/g.css', 'g{}');
    execSync('git add -A', { cwd: tmp, stdio: 'ignore' });
    execSync('git commit -m baseline', { cwd: tmp, stdio: 'ignore' });

    write(tmp, 'a.css', 'a{color:red}'); // unstaged modification, allowed
    write(tmp, 'dist/g.css', 'g{color:red}'); // unstaged modification, excluded folder

    write(tmp, 'b.scss', '$x:1;'); // staged new file, allowed
    execSync('git add b.scss', { cwd: tmp, stdio: 'ignore' });

    write(tmp, 'c.html', '<p></p>'); // untracked, allowed
    write(tmp, 'f.json', '{}'); // untracked, disallowed extension
    write(tmp, 'dist/h.css', 'h{}'); // untracked, excluded folder
    write(tmp, '_variables-new.scss', '$z:3;'); // untracked, source-of-truth

    const result = await getChangedFiles(tmp);

    expect(relPaths(result, tmp)).toEqual(['a.css', 'b.scss', 'c.html']);
  });

  it('parity: findFiles and getChangedFiles agree on inclusion/exclusion for the same file set', async () => {
    write(tmp, 'a.css', 'a{}');
    write(tmp, 'b.scss', '$x:1;');
    write(tmp, 'c.html', '<p></p>');
    write(tmp, 'd.ts', 'const x=1;');
    write(tmp, 'e.js', 'const x=1;');
    write(tmp, 'f.json', '{}');
    write(tmp, 'dist/g.css', 'g{}');
    write(tmp, '_variables.scss', '$y:2;');
    write(tmp, '_variables-new.scss', '$z:3;');
    // Nothing committed or staged — every file is untracked, so getChangedFiles
    // (via `git ls-files --others --exclude-standard`) sees the identical file
    // set findFiles discovers via glob, letting this assert pure filter-rule parity.

    const viaFind = relPaths(await findFiles(tmp), tmp);
    const viaChanged = relPaths(await getChangedFiles(tmp), tmp);

    expect(viaChanged).toEqual(viaFind);
  });
});
