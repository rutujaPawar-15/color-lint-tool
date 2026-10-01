import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { isWithinDir, resolveInputPaths, getChangedFilesSince } from '../../src/utils/file-finder';

describe('isWithinDir', () => {
  const base = path.resolve('/project/app');

  it('accepts a direct child file', () => {
    expect(isWithinDir(base, path.join(base, 'style.scss'))).toBe(true);
  });

  it('accepts a nested descendant file', () => {
    expect(isWithinDir(base, path.join(base, 'src', 'theme', 'a.scss'))).toBe(true);
  });

  it('rejects a parent-escaping path', () => {
    expect(isWithinDir(base, path.join(base, '..', 'other', 'a.scss'))).toBe(false);
  });

  it('rejects a sibling directory', () => {
    expect(isWithinDir(base, path.resolve('/project/other/a.scss'))).toBe(false);
  });

  it('rejects the directory itself (not a file within it)', () => {
    expect(isWithinDir(base, base)).toBe(false);
  });
});

describe('resolveInputPaths', () => {
  let root: string;
  let outsideDir: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'clt-root-'));
    outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clt-out-'));
    fs.mkdirSync(path.join(root, 'css'), { recursive: true });
    fs.writeFileSync(path.join(root, 'css', 'a.scss'), '.a { color: #fff; }');
    fs.writeFileSync(path.join(outsideDir, 'z.scss'), '.z { color: #fff; }');
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  it('resolves an existing file inside the directory', async () => {
    const r = await resolveInputPaths(root, ['css/a.scss']);
    expect(r.files).toEqual([path.resolve(root, 'css', 'a.scss')]);
    expect(r.outside).toEqual([]);
    expect(r.notFound).toEqual([]);
  });

  it('reports a non-existent path as notFound', async () => {
    const r = await resolveInputPaths(root, ['css/does-not-exist.scss']);
    expect(r.files).toEqual([]);
    expect(r.notFound).toEqual(['css/does-not-exist.scss']);
    expect(r.outside).toEqual([]);
  });

  it('reports a parent-escaping path as outside', async () => {
    const r = await resolveInputPaths(root, ['../escape.scss']);
    expect(r.outside).toEqual(['../escape.scss']);
    expect(r.files).toEqual([]);
  });

  it('reports an existing file outside the directory as outside', async () => {
    const r = await resolveInputPaths(root, [path.join(outsideDir, 'z.scss')]);
    expect(r.outside).toHaveLength(1);
    expect(r.files).toEqual([]);
  });
});

describe('getChangedFilesSince', () => {
  let repo: string;
  const git = (args: string, cwd: string) =>
    execSync(`git ${args}`, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

  beforeAll(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'clt-git-'));
    git('init -q', repo);
    git('config user.email t@t.com', repo);
    git('config user.name t', repo);
    git('config commit.gpgsign false', repo);
    // Base commit on main: base.scss + a README (non-fixable type).
    fs.writeFileSync(path.join(repo, 'base.scss'), '.base { color: #000; }');
    fs.writeFileSync(path.join(repo, 'notes.md'), '# notes');
    git('add -A', repo);
    git('commit -q -m base', repo);
    git('branch -M main', repo);
    // Feature branch: add feature.scss + a .txt (non-scannable), modify base? no — keep base clean.
    git('checkout -q -b feature', repo);
    fs.writeFileSync(path.join(repo, 'feature.scss'), '.f { color: #fff; }');
    fs.writeFileSync(path.join(repo, 'skip.txt'), 'not scannable');
    git('add -A', repo);
    git('commit -q -m feature', repo);
  });

  afterAll(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('returns files committed on the branch since base', async () => {
    const files = await getChangedFilesSince(repo, 'main');
    const names = files.map((f) => path.basename(f));
    expect(names).toContain('feature.scss');
  });

  it('does not include files that only exist on base', async () => {
    const files = await getChangedFilesSince(repo, 'main');
    expect(files.map((f) => path.basename(f))).not.toContain('base.scss');
  });

  it('filters out non-scannable file types', async () => {
    const files = await getChangedFilesSince(repo, 'main');
    expect(files.map((f) => path.basename(f))).not.toContain('skip.txt');
  });

  it('returns nothing when the branch equals base', async () => {
    const files = await getChangedFilesSince(repo, 'feature');
    expect(files).toEqual([]);
  });

  it('throws a clear error for an unknown base', async () => {
    await expect(getChangedFilesSince(repo, 'no-such-branch')).rejects.toThrow(/base/i);
  });

  it('treats a base value with shell metacharacters as a literal ref (no shell execution)', async () => {
    const sentinel = path.join(repo, 'pwned.txt');
    // If the value were interpolated into a shell, this would create the file.
    await expect(getChangedFilesSince(repo, `main; echo x > "${sentinel}"`)).rejects.toThrow(/base/i);
    expect(fs.existsSync(sentinel)).toBe(false);
  });
});
