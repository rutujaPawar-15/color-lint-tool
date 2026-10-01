import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { findFiles, getChangedFiles, findTokenFiles, resolveSingleFile, resolveTokenFile } from '../src/utils/file-finder';

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
// manual path-segment string checks (skipReason() in src/utils/file-finder.ts, also used by resolveSingleFile). Both are
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

// Supports AC-19..AC-21: auto-discovery of the token files that feed suggestions.
describe('findTokenFiles', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'color-lint-tokens-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('finds every source-of-truth file at any depth, sorted, and skips excluded folders', async () => {
    write(tmp, 'styles/_variables.scss', '$a: #fff;');
    write(tmp, 'styles/_variables-new.scss', '$b: #000;');
    write(tmp, 'node_modules/lib/_variables.scss', '$c: #f00;'); // excluded folder
    write(tmp, 'styles/theme.scss', '$d: #0f0;'); // not a source-of-truth name

    const result = await findTokenFiles(tmp);

    expect(relPaths(result, tmp)).toEqual(['styles/_variables-new.scss', 'styles/_variables.scss']);
  });

  it('AC-46: from a repo subdirectory, finds token files anywhere in the repo, sorted', async () => {
    write(tmp, 'styles/_variables.scss', '$a: #fff;'); // outside the cwd, inside the repo
    write(tmp, 'app/_variables.scss', '$b: #000;');
    write(tmp, 'node_modules/lib/_variables.scss', '$c: #f00;'); // excluded folder
    initGitRepo(tmp);

    const result = await findTokenFiles(path.join(tmp, 'app'));

    // realpath: git reports the long form of a Windows 8.3 temp path
    expect(relPaths(result, fs.realpathSync.native(tmp))).toEqual(['app/_variables.scss', 'styles/_variables.scss']);
  });

  it('AC-48: outside a git repo, does not look above targetDir', async () => {
    write(tmp, 'styles/_variables.scss', '$a: #fff;'); // next to targetDir, not under it
    write(tmp, 'proj/_variables.scss', '$b: #000;');

    const result = await findTokenFiles(path.join(tmp, 'proj'));

    expect(relPaths(result, tmp)).toEqual(['proj/_variables.scss']);
  });
});

// single-file PRD: resolveSingleFile applies the discovery rules to one named path.
describe('resolveSingleFile', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'color-lint-single-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('AC-3: a relative and an absolute path resolve to the same absolute file, not skipped', () => {
    write(tmp, 'src/a.scss', 'a{}');
    const abs = path.join(tmp, 'src', 'a.scss');

    expect(resolveSingleFile(tmp, 'src/a.scss')).toEqual({ file: abs, skipReason: null });
    expect(resolveSingleFile(tmp, abs)).toEqual({ file: abs, skipReason: null });
  });

  it('EC-1: a missing file throws "File not found: <path as given>"', () => {
    expect(() => resolveSingleFile(tmp, 'missing.scss')).toThrow('File not found: missing.scss');
  });

  it('EC-12: a directory throws "Not a file: <path as given>"', () => {
    fs.mkdirSync(path.join(tmp, 'src'));
    expect(() => resolveSingleFile(tmp, 'src')).toThrow('Not a file: src');
  });

  it('EC-5: an unsupported extension is skipped as not a scannable file type', () => {
    write(tmp, 'notes.md', '#ff0000');
    expect(resolveSingleFile(tmp, 'notes.md').skipReason).toBe('not a scannable file type');
  });

  it('EC-6: a file under an excluded folder is skipped', () => {
    write(tmp, 'node_modules/lib/x.scss', 'a{color:red}');
    expect(resolveSingleFile(tmp, 'node_modules/lib/x.scss').skipReason).toBe('inside an excluded folder');
  });

  it('EC-7: a source-of-truth filename is skipped', () => {
    write(tmp, '_variables.scss', '$primary-blue: #0052cc;');
    expect(resolveSingleFile(tmp, '_variables.scss').skipReason).toBe('source-of-truth token file');
  });

  it('EC-13: a relative path outside the cwd throws "File is outside the current directory: <path as given>"', () => {
    const cwd = path.join(tmp, 'root');
    fs.mkdirSync(cwd);
    write(tmp, 'outside/x.scss', 'a{color:red}');

    expect(() => resolveSingleFile(cwd, '../outside/x.scss')).toThrow('File is outside the current directory: ../outside/x.scss');
  });

  it('EC-15: an absolute path outside the cwd throws — the resolved location is checked, not a leading `..`', () => {
    const cwd = path.join(tmp, 'root');
    fs.mkdirSync(cwd);
    write(tmp, 'other/x.scss', 'a{color:red}');
    const abs = path.join(tmp, 'other', 'x.scss');

    expect(() => resolveSingleFile(cwd, abs)).toThrow(`File is outside the current directory: ${abs}`);
  });

  it('EC-16: a `..` path that resolves back inside the cwd is allowed', () => {
    const cwd = path.join(tmp, 'proj');
    write(tmp, 'proj/a.scss', 'a{color:red}');

    expect(resolveSingleFile(cwd, '../proj/a.scss')).toEqual({ file: path.join(cwd, 'a.scss'), skipReason: null });
  });

  it('EC-18: the outside check runs before the existence check', () => {
    const cwd = path.join(tmp, 'root');
    fs.mkdirSync(cwd);

    expect(() => resolveSingleFile(cwd, '../missing.scss')).toThrow('File is outside the current directory: ../missing.scss');
  });
});

// suggest-css-variable PRD (2026-10-01): a --tokens path must be inside the cwd's git repo,
// or inside the cwd when there is no repo. Temp paths here are os.tmpdir()'s (8.3 short names on
// Windows) while git reports long ones, so these also pin that the comparison is canonical.
describe('resolveTokenFile', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'color-lint-tokenpath-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('AC-41: a token file outside the cwd but inside its repo resolves to its absolute path', () => {
    const repo = path.join(tmp, 'repo');
    write(repo, 'shared/colors.scss', '$primary-blue: #0052cc;');
    fs.mkdirSync(path.join(repo, 'app'));
    initGitRepo(repo);
    const cwd = path.join(repo, 'app');

    expect(resolveTokenFile(cwd, '../shared/colors.scss')).toBe(path.join(repo, 'shared', 'colors.scss'));
  });

  it('AC-42: a relative token path outside the repo throws "Token file is outside the repository: <path as given>"', () => {
    const repo = path.join(tmp, 'repo');
    fs.mkdirSync(repo);
    initGitRepo(repo);
    write(tmp, 'other/colors.scss', '$primary-blue: #0052cc;');

    expect(() => resolveTokenFile(repo, '../other/colors.scss')).toThrow('Token file is outside the repository: ../other/colors.scss');
  });

  it('AC-44: an absolute token path outside the repo throws — the resolved location is checked', () => {
    const repo = path.join(tmp, 'repo');
    fs.mkdirSync(repo);
    initGitRepo(repo);
    write(tmp, 'elsewhere/colors.scss', '$primary-blue: #0052cc;');
    const abs = path.join(tmp, 'elsewhere', 'colors.scss');

    expect(() => resolveTokenFile(repo, abs)).toThrow(`Token file is outside the repository: ${abs}`);
  });

  it('AC-45: outside a git repo, the cwd is the boundary', () => {
    const cwd = path.join(tmp, 'proj');
    fs.mkdirSync(cwd);
    write(tmp, 'shared/colors.scss', '$primary-blue: #0052cc;');

    expect(() => resolveTokenFile(cwd, '../shared/colors.scss')).toThrow('Token file is outside the current directory: ../shared/colors.scss');
  });

  it('AC-45: outside a git repo, a token file inside the cwd is accepted', () => {
    write(tmp, 'tokens/colors.scss', '$primary-blue: #0052cc;');

    expect(resolveTokenFile(tmp, 'tokens/colors.scss')).toBe(path.join(tmp, 'tokens', 'colors.scss'));
  });

  it('EC-22: the boundary check runs before any existence check', () => {
    const repo = path.join(tmp, 'repo');
    fs.mkdirSync(repo);
    initGitRepo(repo);

    expect(() => resolveTokenFile(repo, '../missing.scss')).toThrow('Token file is outside the repository: ../missing.scss');
  });

  it('a missing token file inside the boundary is returned, not thrown — loadVariables reports it (AC-24)', () => {
    expect(resolveTokenFile(tmp, 'does-not-exist.scss')).toBe(path.join(tmp, 'does-not-exist.scss'));
  });
});
