import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { scanFile } from '../src/core/scanner';
import { SCAN_CONFIG } from '../src/core/constants';

const fixture = (name: string) => path.join(__dirname, 'fixtures', name);

describe('scanFile — test.scss', () => {
  it('flags every hardcoded color declaration, including the $variable declarations themselves', async () => {
    const file = fixture('test.scss');
    const violations = await scanFile(file);

    // scanFile has no knowledge of SCAN_CONFIG.sourceOfTruth — that filter lives
    // only in file-finder.ts — so $primary-blue/$surface-white's own hex values
    // ARE reported here, even though this fixture's header comment (written before
    // this test existed) called them "safe". This is real, current behavior.
    expect(violations).toEqual([
      { file, line: 4, column: 1, property: '$primary-blue', value: '#0052cc' },
      { file, line: 5, column: 1, property: '$surface-white', value: '#ffffff' },
      { file, line: 13, column: 3, property: 'color', value: '#ff5630' },
      { file, line: 16, column: 3, property: 'background-color', value: 'rgb(255, 255, 255)' },
      { file, line: 19, column: 3, property: 'border-color', value: 'hsl(210, 100%, 50%)' },
      { file, line: 26, column: 5, property: 'outline', value: 'rgba(0, 0, 0, 0.5)' },
      { file, line: 33, column: 5, property: 'background-color', value: 'blue' },
    ]);
  });

  it('does not flag the $primary-blue variable reference in box-shadow (char-before guard)', async () => {
    const violations = await scanFile(fixture('test.scss'));
    expect(violations.some((v) => v.line === 22)).toBe(false);
  });

  it('does not flag the commented-out #fff333 (PostCSS AST excludes comment nodes)', async () => {
    const violations = await scanFile(fixture('test.scss'));
    expect(violations.some((v) => v.value === '#fff333')).toBe(false);
  });
});

describe('scanFile — test.html', () => {
  it('flags only the real, uncommented color and ignores both the standard and adversarial 4-dash HTML comments', async () => {
    const file = fixture('test.html');
    const violations = await scanFile(file);

    expect(violations).toEqual([
      { file, line: 10, column: 27, property: 'inline-style', value: '#135b0f' },
    ]);
  });
});

describe('scanFile — test.ts', () => {
  it('flags only the two real hex assignments and ignores //, /* */ comment content', async () => {
    const file = fixture('test.ts');
    const violations = await scanFile(file);

    expect(violations).toEqual([
      { file, line: 14, column: 25, property: 'inline-style', value: '#8da210' },
      { file, line: 15, column: 22, property: 'inline-style', value: '#9da378' },
    ]);
  });
});

describe('scanFile — _variables.scss (source-of-truth fixture)', () => {
  it('still reports violations when scanFile is called directly — the sourceOfTruth filename filter lives only in file-finder.ts, not here', async () => {
    const violations = await scanFile(fixture('_variables.scss'));
    expect(violations.length).toBeGreaterThan(0);
  });
});

describe('known gaps (documented, not fixed, by this suite)', () => {
  it('[gap] .less is listed as css-like but missing from the scanned extensions list, so .less files are never discovered by findFiles/getChangedFiles', () => {
    expect(SCAN_CONFIG.cssLikeExtensions).toContain('.less');
    expect(SCAN_CONFIG.extensions).not.toContain('.less');
  });

  it('[gap] scanTextFile has no char-before guard, so a named color inside a hyphenated string literal false-positives', async () => {
    const file = fixture('_tmp-named-color-gap.ts');
    fs.writeFileSync(file, "const cls = 'primary-blue';\n");
    try {
      const violations = await scanFile(file);
      expect(violations).toEqual([
        { file, line: 1, column: 22, property: 'inline-style', value: 'blue' },
      ]);
    } finally {
      fs.unlinkSync(file);
    }
  });
});
