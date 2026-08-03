import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { scanFile } from '../../src/core/scanner';

const tmpFiles: string[] = [];

function writeTemp(ext: string, content: string): string {
  const file = path.join(
    os.tmpdir(),
    `color-lint-scanner-test-${tmpFiles.length}-${ext.replace('.', '')}${ext}`
  );
  fs.writeFileSync(file, content, 'utf-8');
  tmpFiles.push(file);
  return file;
}

afterEach(() => {
  for (const f of tmpFiles.splice(0)) {
    try {
      fs.unlinkSync(f);
    } catch {
      // already gone, ignore
    }
  }
});

describe('scanCssFile (.scss, PostCSS AST path)', () => {
  it('flags hex, rgb, and hsl violations with correct property/value', async () => {
    const file = writeTemp(
      '.scss',
      [
        '$primary-blue: #0052cc;',
        '.box {',
        '  color: #ff5630;',
        '  background-color: rgb(255, 255, 255);',
        '  border-color: hsl(210, 100%, 50%);',
        '  box-shadow: 0 4px 8px $primary-blue;',
        '}',
      ].join('\n')
    );

    const violations = await scanFile(file);

    expect(violations).toHaveLength(4);
    expect(violations.map((v) => v.value)).toEqual([
      '#0052cc',
      '#ff5630',
      'rgb(255, 255, 255)',
      'hsl(210, 100%, 50%)',
    ]);
    expect(violations[1]).toMatchObject({ property: 'color', value: '#ff5630' });
  });

  it('does not flag a named color that is part of a variable reference ($primary-blue)', async () => {
    const file = writeTemp(
      '.scss',
      ['$primary-blue: #0052cc;', '.box {', '  box-shadow: 0 4px 8px $primary-blue;', '}'].join('\n')
    );

    const violations = await scanFile(file);

    // Only the hex in the variable's own definition; "blue" inside "$primary-blue" is not a violation.
    expect(violations).toHaveLength(1);
    expect(violations[0].value).toBe('#0052cc');
  });
});

describe('.less files (routed through the CSS AST path)', () => {
  it('scans .less files for hard-coded colors', async () => {
    const file = writeTemp('.less', '.box {\n  color: #ff0000;\n}\n');

    const violations = await scanFile(file);

    expect(violations).toHaveLength(1);
    expect(violations[0].value).toBe('#ff0000');
  });
});

describe('scanTextFile (.ts/.html, regex path)', () => {
  it('flags a hard-coded hex color and derives its property from context', async () => {
    const file = writeTemp('.ts', 'class Widget {\n  public bordercolor= #8da210;\n}\n');

    const violations = await scanFile(file);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      line: 2,
      property: 'bordercolor',
      value: '#8da210',
    });
  });

  it('derives the property name when the color value itself is quoted', async () => {
    const file = writeTemp(
      '.ts',
      "const style = { background: '#ffffff', color: \"#000000\" };\n"
    );

    const violations = await scanFile(file);

    expect(violations).toHaveLength(2);
    expect(violations.map((v) => v.property)).toEqual(['background', 'color']);
  });

  it('falls back to "value" when there is no clear property prefix', async () => {
    const file = writeTemp('.ts', 'const list = [1, 2, "#ff0000"];\n');

    const violations = await scanFile(file);

    expect(violations).toHaveLength(1);
    expect(violations[0].property).toBe('value');
  });

  it('does not flag colors inside a // line comment', async () => {
    const file = writeTemp('.ts', '// the color should be #ff8888\nconst x = 1;\n');

    const violations = await scanFile(file);

    expect(violations).toHaveLength(0);
  });

  it('does not flag colors inside a /* block */ comment, and resumes scanning after it', async () => {
    const file = writeTemp(
      '.ts',
      ['/* old rule', '   color: #000000; */', 'const active = "#ff0000";'].join('\n')
    );

    const violations = await scanFile(file);

    expect(violations).toHaveLength(1);
    expect(violations[0].value).toBe('#ff0000');
    expect(violations[0].line).toBe(3);
  });

  it('does not flag colors inside an <!-- html --> comment, and resumes scanning after it', async () => {
    const file = writeTemp(
      '.html',
      [
        '<!-- <div style="color:#111111"></div> -->',
        '<div style="color:#222222"></div>',
      ].join('\n')
    );

    const violations = await scanFile(file);

    expect(violations).toHaveLength(1);
    expect(violations[0].value).toBe('#222222');
  });

  it('does not misread "//" inside a string literal as a line comment', async () => {
    const file = writeTemp(
      '.ts',
      'const url = "http://example.com/#ff0000";\nconst other = "#00ff00";\n'
    );

    const violations = await scanFile(file);

    // Both hex values must still be found — if "//" inside the string were
    // mistakenly treated as a comment start, the rest of the line (and the
    // regression case on line 2) could be masked away incorrectly.
    expect(violations.map((v) => v.value)).toEqual(['#ff0000', '#00ff00']);
  });
});

describe('named color context guard (bare identifiers vs. real color usage)', () => {
  it('does not flag a bare identifier that happens to share a name with a color', async () => {
    const file = writeTemp('.ts', 'let red = 5;\nconst blueValue = red + 1;\n');

    const violations = await scanFile(file);

    expect(violations).toHaveLength(0);
  });

  it('flags a named color used inside a string literal', async () => {
    const file = writeTemp('.ts', "const fallbackColor = 'red';\n");

    const violations = await scanFile(file);

    expect(violations).toHaveLength(1);
    expect(violations[0].value).toBe('red');
  });

  it('flags a named color inside an HTML style attribute, case-insensitively', async () => {
    const file = writeTemp('.html', '<div style="color: BLUE"></div>\n');

    const violations = await scanFile(file);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ property: 'color', value: 'BLUE' });
  });
});
