import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { discoverVariableFiles } from '../../src/core/setup/discovery';

const tmpDirs: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function writeFile(dir: string, relPath: string, content: string): void {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('discoverVariableFiles', () => {
  it('finds a stylesheet that defines color variables and returns its definitions', async () => {
    const dir = makeTmpDir('discover-basic-');
    writeFile(dir, 'src/_variables.scss', '$color-red: #ff0000;\n$color-blue: #0000ff;');

    const found = await discoverVariableFiles(dir);

    expect(found).toHaveLength(1);
    expect(found[0].file.endsWith('_variables.scss')).toBe(true);
    expect(found[0].definitions.map(d => d.name)).toEqual(['$color-red', '$color-blue']);
  });

  it('ranks files by number of color variables, most first', async () => {
    const dir = makeTmpDir('discover-rank-');
    writeFile(dir, 'few.scss', '$a: #fff;');
    writeFile(dir, 'many.scss', '$a: #fff;\n$b: #000;\n$c: red;');

    const found = await discoverVariableFiles(dir);

    expect(found.map(f => path.basename(f.file))).toEqual(['many.scss', 'few.scss']);
  });

  it('excludes files that define no color variables', async () => {
    const dir = makeTmpDir('discover-nocolor-');
    writeFile(dir, 'styles.scss', '$spacing: 8px;\n.box { color: #ff0000; }'); // usage, not a color var
    writeFile(dir, 'vars.scss', '$color-red: #ff0000;');

    const found = await discoverVariableFiles(dir);

    expect(found.map(f => path.basename(f.file))).toEqual(['vars.scss']);
  });

  it('ignores node_modules', async () => {
    const dir = makeTmpDir('discover-nodemodules-');
    writeFile(dir, 'node_modules/pkg/_vars.scss', '$color-red: #ff0000;');
    writeFile(dir, 'app.scss', '$color-blue: #0000ff;');

    const found = await discoverVariableFiles(dir);

    expect(found.map(f => path.basename(f.file))).toEqual(['app.scss']);
  });

  it('returns an empty array when no stylesheet defines color variables', async () => {
    const dir = makeTmpDir('discover-empty-');
    writeFile(dir, 'app.scss', '.box { color: #ff0000; }');

    expect(await discoverVariableFiles(dir)).toEqual([]);
  });
});
