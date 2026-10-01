import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { loadVariables, suggestVariable, TokenMap } from '../src/core/variables';

// Each test writes its own small token file into a temp dir, so the token source
// being asserted against is visible inline next to the expectation.
let tmp: string;
let counter = 0;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'color-lint-tokens-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

function tokensFrom(...contents: string[]): TokenMap {
  const paths = contents.map((content) => {
    const file = path.join(tmp, `tokens-${counter++}.scss`);
    fs.writeFileSync(file, content);
    return file;
  });
  return loadVariables(paths);
}

describe('suggestVariable — hex matching', () => {
  it('AC-1: suggests the SCSS variable whose hex value equals the violation', () => {
    const tokens = tokensFrom('$primary-blue: #0052cc;');
    expect(suggestVariable('#0052cc', tokens)).toEqual(['$primary-blue']);
  });

  it('AC-2: ignores hex case when matching', () => {
    const tokens = tokensFrom('$primary-blue: #0052cc;');
    expect(suggestVariable('#0052CC', tokens)).toEqual(['$primary-blue']);
  });

  it('AC-3: expands a shorthand hex violation before matching', () => {
    const tokens = tokensFrom('$surface-white: #ffffff;');
    expect(suggestVariable('#fff', tokens)).toEqual(['$surface-white']);
  });

  it('AC-4: expands a shorthand hex token value before matching', () => {
    const tokens = tokensFrom('$surface-white: #fff;');
    expect(suggestVariable('#ffffff', tokens)).toEqual(['$surface-white']);
  });

  it('AC-15: returns no suggestion when no token has the violation color', () => {
    const tokens = tokensFrom('$primary-blue: #0052cc;');
    expect(suggestVariable('#123456', tokens)).toEqual([]);
  });

  it('EC-5: treats 8-digit hex with ff alpha as equal to opaque 6-digit hex', () => {
    const tokens = tokensFrom('$full: #0052ccff;');
    expect(suggestVariable('#0052cc', tokens)).toEqual(['$full']);
  });
});

describe('suggestVariable — rgb/hsl normalization', () => {
  it('AC-5: matches an rgb() violation against a hex token', () => {
    const tokens = tokensFrom('$primary-blue: #0052cc;');
    expect(suggestVariable('rgb(0, 82, 204)', tokens)).toEqual(['$primary-blue']);
  });

  it('AC-6: treats rgba() with alpha 1 as equal to opaque hex', () => {
    const tokens = tokensFrom('$primary-blue: #0052cc;');
    expect(suggestVariable('rgba(0, 82, 204, 1)', tokens)).toEqual(['$primary-blue']);
  });

  it('AC-7: does not match when alpha differs', () => {
    const tokens = tokensFrom('$primary-blue: #0052cc;');
    expect(suggestVariable('rgba(0, 82, 204, 0.5)', tokens)).toEqual([]);
  });

  it('AC-8: matches rgba() alpha 0.5 against an 8-digit hex token with alpha 80', () => {
    const tokens = tokensFrom('$primary-blue-50: #0052cc80;');
    expect(suggestVariable('rgba(0, 82, 204, 0.5)', tokens)).toEqual(['$primary-blue-50']);
  });

  it('AC-9: matches an hsl() violation against a hex token', () => {
    const tokens = tokensFrom('$primary-blue: #0052cc;');
    expect(suggestVariable('hsl(216, 100%, 40%)', tokens)).toEqual(['$primary-blue']);
  });

  it('AC-10: normalizes rgb() token values with the same rules as violations', () => {
    const tokens = tokensFrom('$brand: rgb(0, 82, 204);');
    expect(suggestVariable('#0052cc', tokens)).toEqual(['$brand']);
  });

  it('EC-6: accepts space/slash rgb syntax', () => {
    const tokens = tokensFrom('$primary-blue: #0052cc;');
    expect(suggestVariable('rgb(0 82 204 / 1)', tokens)).toEqual(['$primary-blue']);
  });

  it('EC-7: scales percent rgb channels to 0-255', () => {
    const tokens = tokensFrom('$green: #00ff00;');
    expect(suggestVariable('rgb(0%, 100%, 0%)', tokens)).toEqual(['$green']);
  });

  it('EC-8: accepts a deg hue unit and hsla() with alpha 1', () => {
    const tokens = tokensFrom('$primary-blue: #0052cc;');
    expect(suggestVariable('hsl(216deg, 100%, 40%)', tokens)).toEqual(['$primary-blue']);
    expect(suggestVariable('hsla(216, 100%, 40%, 1)', tokens)).toEqual(['$primary-blue']);
  });
});

describe('suggestVariable — named colors, custom properties, multiple matches', () => {
  it('AC-11: maps a named color violation to its CSS hex value', () => {
    const tokens = tokensFrom('$surface-white: #ffffff;');
    expect(suggestVariable('white', tokens)).toEqual(['$surface-white']);
  });

  it('AC-12: never suggests a token for transparent or currentColor', () => {
    const tokens = tokensFrom('$clear: transparent;\n$ink: currentColor;');
    expect(suggestVariable('transparent', tokens)).toEqual([]);
    expect(suggestVariable('currentColor', tokens)).toEqual([]);
  });

  it('AC-13: suggests var(--name) for a CSS custom property token', () => {
    const tokens = tokensFrom('--primary-blue: #0052cc;');
    expect(suggestVariable('#0052cc', tokens)).toEqual(['var(--primary-blue)']);
  });

  it('AC-14: lists every token with the same color, in declaration order', () => {
    const tokens = tokensFrom('$white: #fff;\n$surface-white: #ffffff;');
    expect(suggestVariable('#ffffff', tokens)).toEqual(['$white', '$surface-white']);
  });

  it('EC-13: lists SCSS and custom-property forms of the same color in declaration order', () => {
    const tokens = tokensFrom('$primary-blue: #0052cc;\n:root { --primary-blue: #0052cc; }');
    expect(suggestVariable('#0052cc', tokens)).toEqual(['$primary-blue', 'var(--primary-blue)']);
  });
});

describe('loadVariables — token file parsing', () => {
  it('EC-1: strips !default and !important flags from token values', () => {
    const tokens = tokensFrom('$primary-blue: #0052cc !default;\n:root { --accent: #ff0000 !important; }');
    expect(suggestVariable('#0052cc', tokens)).toEqual(['$primary-blue']);
    expect(suggestVariable('#ff0000', tokens)).toEqual(['var(--accent)']);
  });

  it('EC-2: skips non-color tokens without failing, still loading color tokens', () => {
    const tokens = tokensFrom('$spacing: 8px;\n$brand: $primary-blue;\n$primary-blue: #0052cc;');
    expect(suggestVariable('#0052cc', tokens)).toEqual(['$primary-blue']);
    expect([...tokens.values()].flat()).toEqual(['$primary-blue']);
  });

  it('EC-3: reads custom properties nested inside a rule', () => {
    const tokens = tokensFrom(':root { --primary-blue: #0052cc; }');
    expect(suggestVariable('#0052cc', tokens)).toEqual(['var(--primary-blue)']);
  });

  it('EC-4: ignores token declarations inside comments', () => {
    const tokens = tokensFrom('/* $ghost: #0052cc; */\n// $ghost2: #0052cc;\n$real: #ffffff;');
    expect(suggestVariable('#0052cc', tokens)).toEqual([]);
  });

  it('EC-9: when a token is declared twice, the last declaration wins', () => {
    const tokens = tokensFrom('$a: #fff;\n$a: #000;');
    expect(suggestVariable('#000', tokens)).toEqual(['$a']);
    expect(suggestVariable('#fff', tokens)).toEqual([]);
  });
});

// Writes each named token file into its own subdir, so `_variables.scss` and
// `_variables-new.scss` keep their real basenames.
function tokensFromFiles(files: Record<string, string>, order = Object.keys(files)): TokenMap {
  const dir = path.join(tmp, `set-${counter++}`);
  fs.mkdirSync(dir);
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return loadVariables(order.map((name) => path.join(dir, name)));
}

describe('suggestVariable — order across token files', () => {
  it('EC-21: tokens keep the order their files were passed in — _variables-new.scss gets no preference', () => {
    const files = { '_variables.scss': '$old-white: #fff;', '_variables-new.scss': '$white: #fff;' };
    expect(suggestVariable('#fff', tokensFromFiles(files))).toEqual(['$old-white', '$white']);
  });
});

// Supports EC-23 / EC-24: auto-discovered token files that cannot be parsed are skipped, not fatal.
describe('loadVariables — per-file error callback', () => {
  it('with a callback, an unparseable file is reported to it and skipped; other files still load', () => {
    const broken = path.join(tmp, '_variables.scss');
    const good = path.join(tmp, '_variables-new.scss');
    fs.writeFileSync(broken, 'a { color: #fff;'); // unclosed block
    fs.writeFileSync(good, '$primary-blue: #0052cc;');
    const errors: string[] = [];

    const tokens = loadVariables([broken, good], (err) => errors.push(err.message));

    expect(suggestVariable('#0052cc', tokens)).toEqual(['$primary-blue']);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(`Could not load design token file ${broken}`);
  });

  it('without a callback, an unparseable file still throws', () => {
    const broken = path.join(tmp, 'broken.scss');
    fs.writeFileSync(broken, 'a { color: #fff;');

    expect(() => loadVariables([broken])).toThrow(`Could not load design token file ${broken}`);
  });
});
