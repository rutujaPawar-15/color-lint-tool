import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseForFix, fixFile, ChooseToken, STOP } from '../src/core/fixer';
import { loadVariables, TokenMap } from '../src/core/variables';

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'color-lint-fixer-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

// Loads a TokenMap from token-file source, exactly as the CLI would.
function tokensFrom(source: string): TokenMap {
  const file = path.join(tmp, '_variables.scss');
  fs.writeFileSync(file, source);
  return loadVariables([file]);
}

// Never expected to be called: every test using it has at most one usable candidate.
const noPrompt: ChooseToken = async () => {
  throw new Error('unexpected prompt');
};

async function fix(file: string, content: string, tokens: TokenMap, choose: ChooseToken = noPrompt) {
  return fixFile(parseForFix(path.join(tmp, file), content), tokens, choose);
}

describe('fixFile — replacement', () => {
  it('AC-1: replaces a hard-coded color with its single matching SCSS token', async () => {
    const tokens = tokensFrom('$primary-blue: #0052cc;');

    const result = await fix('src/app.scss', 'a { color: #0052cc; }', tokens);

    expect(result.content).toBe('a { color: $primary-blue; }');
    expect(result.replaced).toBe(1);
  });

  it('AC-2: changes only the color text — every other byte is identical', async () => {
    const tokens = tokensFrom('$primary-blue: #0052cc;');
    const original = [
      '// header comment',
      '',
      '.card {',
      '    margin:   0  auto ;',
      '  border: 1px solid #0052cc;   /* trailing */',
      '\t\tpadding: 4px;',
      '}',
      '',
    ].join('\n');

    const result = await fix('src/app.scss', original, tokens);

    expect(result.content).toBe(original.replace('#0052cc', '$primary-blue'));
  });

  it('AC-4: leaves a color with no matching token unchanged and counts it as no-match', async () => {
    const tokens = tokensFrom('$primary-blue: #0052cc;');

    const result = await fix('src/app.scss', 'a { color: #123456; }', tokens);

    expect(result.content).toBe('a { color: #123456; }');
    expect(result).toMatchObject({ replaced: 0, noMatch: 1, skipped: 0 });
  });
});

describe('fixFile — file-type safety', () => {
  it('AC-11: never inserts a $token into .css — the violation counts as no-match', async () => {
    const tokens = tokensFrom('$primary-blue: #0052cc;');

    const result = await fix('src/app.css', 'a { color: #0052cc; }', tokens);

    expect(result.content).toBe('a { color: #0052cc; }');
    expect(result).toMatchObject({ replaced: 0, noMatch: 1 });
  });

  it('AC-12: in .css only the var(--x) candidate is valid, so it is used without prompting', async () => {
    const tokens = tokensFrom('$white: #fff;\n:root { --white: #fff; }');

    const result = await fix('src/app.css', 'a { color: #fff; }', tokens);

    expect(result.content).toBe('a { color: var(--white); }');
  });
});

describe('fixFile — edge cases', () => {
  it('EC-3: replaces every color within one declaration', async () => {
    const tokens = tokensFrom('$primary-blue: #0052cc;\n$white: #fff;');

    const result = await fix('src/app.scss', 'a { box-shadow: 0 0 0 #0052cc, 0 0 0 #fff; }', tokens);

    expect(result.content).toBe('a { box-shadow: 0 0 0 $primary-blue, 0 0 0 $white; }');
    expect(result.replaced).toBe(2);
  });

  it('EC-4: replaces two declarations on one line', async () => {
    const tokens = tokensFrom('$primary-blue: #0052cc;\n$white: #fff;');

    const result = await fix('src/app.scss', 'a { color: #0052cc; background: #fff; }', tokens);

    expect(result.content).toBe('a { color: $primary-blue; background: $white; }');
  });

  it('EC-5: replaces a named color, and leaves an existing token reference alone (char-before guard)', async () => {
    const tokens = tokensFrom('$surface-white: #ffffff;\n$primary-blue: #0000ff;');

    const named = await fix('src/app.scss', 'a { color: white; }', tokens);
    const already = await fix('src/app.scss', 'a { color: $primary-blue; }', tokens);

    expect(named.content).toBe('a { color: $surface-white; }');
    expect(already.content).toBe('a { color: $primary-blue; }');
    expect(already).toMatchObject({ replaced: 0, noMatch: 0, skipped: 0 });
  });

  it('EC-6: leaves colors inside a comment unchanged', async () => {
    const tokens = tokensFrom('$primary-blue: #0052cc;');
    const original = '/* old: #0052cc */\na { margin: 0; }';

    const result = await fix('src/app.scss', original, tokens);

    expect(result.content).toBe(original);
  });

  it('EC-10: preserves CRLF line endings', async () => {
    const tokens = tokensFrom('$primary-blue: #0052cc;');

    const result = await fix('src/app.scss', 'a {\r\n  color: #0052cc;\r\n}\r\n', tokens);

    expect(result.content).toBe('a {\r\n  color: $primary-blue;\r\n}\r\n');
  });

  it('EC-11: an unparseable file throws an error naming the file', () => {
    expect(() => parseForFix(path.join(tmp, 'broken.scss'), 'a { color: #fff;')).toThrow(/broken\.scss/);
  });
});

describe('fixFile — picking between several candidates', () => {
  it('asks once per occurrence, in file order, with candidates in suggestion order', async () => {
    const tokens = tokensFrom('$white: #fff;\n$surface-white: #fff;');
    const choose = vi.fn<ChooseToken>()
      .mockResolvedValueOnce('$white')
      .mockResolvedValueOnce('$surface-white');

    const result = await fix('src/app.scss', 'a { color: #fff; }\nb { color: #fff; }', tokens, choose);

    expect(choose).toHaveBeenCalledTimes(2);
    expect(choose.mock.calls[0][1]).toEqual(['$white', '$surface-white']);
    expect(choose.mock.calls[0][0]).toMatchObject({ line: 1, property: 'color', value: '#fff' });
    expect(choose.mock.calls[1][0]).toMatchObject({ line: 2 });
    expect(result.content).toBe('a { color: $white; }\nb { color: $surface-white; }');
  });

  it('a null or unknown pick leaves the occurrence unchanged and counts it as skipped', async () => {
    const tokens = tokensFrom('$white: #fff;\n$surface-white: #fff;');
    const choose = vi.fn<ChooseToken>().mockResolvedValueOnce(null).mockResolvedValueOnce('$nope');

    const result = await fix('src/app.scss', 'a { color: #fff; }\nb { color: #fff; }', tokens, choose);

    expect(result.content).toBe('a { color: #fff; }\nb { color: #fff; }');
    expect(result).toMatchObject({ replaced: 0, noMatch: 0, skipped: 2 });
  });
});

describe('fixFile — stopping early', () => {
  it('EC-13: a stop partway through one declaration keeps earlier picks and leaves the rest byte-identical', async () => {
    const tokens = tokensFrom('$white: #fff;\n$surface-white: #fff;');
    const choose = vi.fn<ChooseToken>().mockResolvedValueOnce('$surface-white').mockResolvedValueOnce(STOP);

    const result = await fix('src/app.scss', 'a { box-shadow: 0 0 0 #fff, 0 0 0 #fff; }\nb { color: #fff; }', tokens, choose);

    expect(choose).toHaveBeenCalledTimes(2);
    expect(result.content).toBe('a { box-shadow: 0 0 0 $surface-white, 0 0 0 #fff; }\nb { color: #fff; }');
    expect(result).toMatchObject({ replaced: 1, noMatch: 0, skipped: 0, notProcessed: 2 });
  });
});
