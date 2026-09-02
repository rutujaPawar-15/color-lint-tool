import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { extractDefinedVariables, loadDefinedVariables } from '../../src/core/fixer/variables';

const tmpDirs: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('extractDefinedVariables', () => {
  it('extracts SCSS variable definitions', () => {
    const content = '$color-red: #ff0000;\n$color-white: #ffffff;';
    const vars = extractDefinedVariables(content);
    expect(vars).toContain('$color-red');
    expect(vars).toContain('$color-white');
  });

  it('extracts CSS custom property definitions', () => {
    const content = ':root {\n  --color-red: #ff0000;\n  --spacing: 8px;\n}';
    const vars = extractDefinedVariables(content);
    expect(vars).toContain('--color-red');
    expect(vars).toContain('--spacing');
  });

  it('does not treat a variable usage as a definition', () => {
    // `$color-red` here is used, not defined (no colon directly after in a declaration position)
    const content = '.box { color: $color-red; }';
    const vars = extractDefinedVariables(content);
    expect(vars).not.toContain('$color-red');
  });

  it('returns an empty array for content with no variables', () => {
    expect(extractDefinedVariables('.box { color: red; }')).toEqual([]);
  });
});

describe('loadDefinedVariables', () => {
  it('reads and merges variable names across multiple sourceOfTruth files', async () => {
    const dir = makeTmpDir('vars-load-');
    const a = path.join(dir, '_variables.scss');
    const b = path.join(dir, '_variables-new.scss');
    fs.writeFileSync(a, '$color-red: #ff0000;', 'utf-8');
    fs.writeFileSync(b, '$color-blue: #0000ff;', 'utf-8');

    const vars = await loadDefinedVariables([a, b]);

    expect(vars.has('$color-red')).toBe(true);
    expect(vars.has('$color-blue')).toBe(true);
  });

  it('silently skips sourceOfTruth files that do not exist', async () => {
    const dir = makeTmpDir('vars-missing-');
    const real = path.join(dir, '_variables.scss');
    fs.writeFileSync(real, '$color-red: #ff0000;', 'utf-8');
    const missing = path.join(dir, 'does-not-exist.scss');

    const vars = await loadDefinedVariables([real, missing]);

    // Should not throw; should still contain the real file's variable.
    expect(vars.has('$color-red')).toBe(true);
  });
});
