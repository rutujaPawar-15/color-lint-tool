import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { isWithinDir, resolveInputPaths } from '../../src/utils/file-finder';

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
