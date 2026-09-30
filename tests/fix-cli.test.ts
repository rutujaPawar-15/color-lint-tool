import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';
import chalk from 'chalk';

// Runs the real color-lint-fix (src/fix-cli.ts via ts-node) with a temp dir as the target
// dir, answers fed on stdin — exactly as a user would run it inside a RIB project.
const repoRoot = path.resolve(__dirname, '..');
const tsNodeRegister = require.resolve('ts-node/register/transpile-only', { paths: [repoRoot] });

function write(dir: string, rel: string, content: string): void {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function read(dir: string, rel: string): string {
  return fs.readFileSync(path.join(dir, rel), 'utf8');
}

interface RunOptions {
  color?: boolean;  // FORCE_COLOR=1 instead of 0
  preload?: string; // extra `node -r` module, loaded before the entry
}

function runEntry(entry: string, cwd: string, args: string[], input: string, opts: RunOptions = {}) {
  const preload = opts.preload ? ['-r', opts.preload] : [];
  const result = spawnSync(process.execPath, ['-r', tsNodeRegister, ...preload, path.join(repoRoot, 'src', entry), ...args], {
    cwd,
    input,
    encoding: 'utf8',
    timeout: 20_000,
    env: { ...process.env, FORCE_COLOR: opts.color ? '1' : '0', TS_NODE_PROJECT: path.join(repoRoot, 'tsconfig.json') },
  });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

const fix = (cwd: string, args: string[] = [], input = '', opts?: RunOptions) => runEntry('fix-cli.ts', cwd, args, input, opts);
const lint = (cwd: string, args: string[] = [], opts?: RunOptions) => runEntry('cli.ts', cwd, args, '', opts);

// Relative path → content of every file under dir, for byte-identical comparisons.
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== '.git') walk(full); }
      else out[path.relative(dir, full)] = fs.readFileSync(full, 'utf8');
    }
  };
  walk(dir);
  return out;
}

function lastLine(stdout: string): string {
  return stdout.trim().split(/\r?\n/).pop()!.trim();
}

function lines(stdout: string): string[] {
  return stdout.split(/\r?\n/);
}

function lintViolationCount(stdout: string): number {
  const m = stdout.match(/Found (\d+) violation\(s\)/);
  return m ? Number(m[1]) : 0;
}

const WHITE_TOKENS = '$white: #fff;\n$surface-white: #fff;';
const PROMPT_2 = 'Pick a token [1-2, s=skip, q=quit]:';
const color = new chalk.Instance({ level: 1 }); // what FORCE_COLOR=1 selects in the child

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'color-lint-fix-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('color-lint-fix — replacement', { timeout: 60_000 }, () => {
  it('AC-3: shows the violation, numbered candidates in suggestion order and a prompt; applies the pick', () => {
    write(tmp, '_variables.scss', WHITE_TOKENS);
    write(tmp, 'src/app.scss', '// line 1\n\n.a {\n  color: #fff;\n}\n');

    const { stdout } = fix(tmp, [], '2\n');

    const out = lines(stdout);
    const v = out.indexOf('  ⚠  Line 4, Col 3  |  color: #fff');
    expect(v).toBeGreaterThanOrEqual(0);
    expect(out[v + 1]).toBe('     1) $white');
    expect(out[v + 2]).toBe('     2) $surface-white');
    expect(out[v + 3].startsWith(`     ${PROMPT_2}`)).toBe(true);
    expect(read(tmp, 'src/app.scss')).toBe('// line 1\n\n.a {\n  color: $surface-white;\n}\n');
  });

  it('AC-5: a following color-lint run reports exactly V − R violations', () => {
    write(tmp, '_variables.scss', '$primary-blue: #0052cc;\n' + WHITE_TOKENS);
    write(tmp, 'src/app.scss', 'a { color: #0052cc; background: #fff; border-color: #123456; }');
    write(tmp, 'src/app.css', 'a { color: #0052cc; }');
    write(tmp, 'src/app.ts', "const c = '#0052cc';");

    const v = lintViolationCount(lint(tmp).stdout);
    const fixed = fix(tmp, [], '1\n');
    const r = Number(lastLine(fixed.stdout).match(/^Replaced (\d+)/)![1]);
    const after = lintViolationCount(lint(tmp).stdout);

    expect(v).toBe(5);
    expect(r).toBe(2);
    expect(after).toBe(v - r);
  });

  it('AC-6: a second run with empty stdin leaves every file byte-identical', () => {
    write(tmp, '_variables.scss', '$primary-blue: #0052cc;\n' + WHITE_TOKENS);
    write(tmp, 'src/app.scss', 'a { color: #0052cc; background: #fff; border-color: #123456; }');
    fix(tmp, [], '1\n');
    const before = snapshot(tmp);

    fix(tmp, [], '');

    expect(snapshot(tmp)).toEqual(before);
  });

  it('AC-7: the last line is the summary with replaced, files, no-match and skipped counts', () => {
    write(tmp, '_variables.scss', '$primary-blue: #0052cc;\n' + WHITE_TOKENS);
    write(tmp, 'src/a.scss', 'a { color: #0052cc; border-color: #123456; }');
    write(tmp, 'src/b.scss', 'b { color: #0052cc; background: #fff; }');
    write(tmp, 'src/c.scss', 'c { margin: 0; }');

    const { stdout } = fix(tmp, [], 'abc\n');

    expect(lastLine(stdout)).toBe('Replaced 2 color(s) in 2 file(s); 1 without a matching token, 1 skipped.');
  });

  it('AC-8: -t / --tokens selects the token file', () => {
    write(tmp, 'tokens/colors.scss', '$primary-blue: #0052cc;');
    write(tmp, 'src/a.scss', 'a { color: #0052cc; }');
    write(tmp, 'src/b.scss', 'b { color: #0052cc; }');

    fix(path.join(tmp), ['-t', 'tokens/colors.scss']);
    expect(read(tmp, 'src/a.scss')).toBe('a { color: $primary-blue; }');

    write(tmp, 'src/a.scss', 'a { color: #0052cc; }');
    fix(tmp, ['--tokens', 'tokens/colors.scss']);
    expect(read(tmp, 'src/a.scss')).toBe('a { color: $primary-blue; }');
  });

  it('AC-8: -c / --changed fixes only git-changed files', () => {
    execSync('git init', { cwd: tmp, stdio: 'ignore' });
    execSync('git config user.email "test@example.com"', { cwd: tmp, stdio: 'ignore' });
    execSync('git config user.name "Test"', { cwd: tmp, stdio: 'ignore' });
    write(tmp, '_variables.scss', '$primary-blue: #0052cc;');
    write(tmp, 'src/a.scss', 'a { color: #0052cc; }');
    write(tmp, 'src/b.scss', 'b { color: #0052cc; }');
    execSync('git add -A && git commit -m init', { cwd: tmp, stdio: 'ignore' });
    write(tmp, 'src/a.scss', 'a { color: #0052cc; }\n');

    fix(tmp, ['-c']);
    expect(read(tmp, 'src/a.scss')).toBe('a { color: $primary-blue; }\n');
    expect(read(tmp, 'src/b.scss')).toBe('b { color: #0052cc; }');

    write(tmp, 'src/a.scss', 'a { color: #0052cc; }\n');
    fix(tmp, ['--changed']);
    expect(read(tmp, 'src/a.scss')).toBe('a { color: $primary-blue; }\n');
    expect(read(tmp, 'src/b.scss')).toBe('b { color: #0052cc; }');
  });
});

describe('color-lint-fix — interactive pick', { timeout: 60_000 }, () => {
  it('AC-9: prompts separately for every occurrence and applies each answer', () => {
    write(tmp, '_variables.scss', WHITE_TOKENS);
    write(tmp, 'src/app.scss', 'a { color: #fff; }\nb { color: #fff; }');

    const { stdout } = fix(tmp, [], '1\n2\n');

    expect(stdout.split(PROMPT_2)).toHaveLength(3);
    expect(read(tmp, 'src/app.scss')).toBe('a { color: $white; }\nb { color: $surface-white; }');
  });

  it('AC-10: a single usable token is applied without a prompt', () => {
    write(tmp, '_variables.scss', '$primary-blue: #0052cc;');
    write(tmp, 'src/app.scss', 'a { color: #0052cc; }');

    const { stdout } = fix(tmp);

    expect(stdout).not.toContain('Pick a token');
    expect(read(tmp, 'src/app.scss')).toBe('a { color: $primary-blue; }');
  });

  it('EC-1: 0, out-of-range, non-numeric and empty answers each skip with a message, without re-asking', () => {
    write(tmp, '_variables.scss', WHITE_TOKENS);
    const original = ['a { color: #fff; }', 'b { color: #fff; }', 'c { color: #fff; }', 'd { color: #fff; }', 'e { color: #fff; }'].join('\n');
    write(tmp, 'src/app.scss', original);

    const { stdout } = fix(tmp, [], '0\n3\nabc\n\n2\n');

    expect(stdout.split(PROMPT_2)).toHaveLength(6);
    expect(lines(stdout).filter((l) => l === '     Invalid choice, hence skipped.')).toHaveLength(4);
    expect(read(tmp, 'src/app.scss')).toBe(original.replace(/e \{ color: #fff; \}/, 'e { color: $surface-white; }'));
    expect(lastLine(stdout)).toBe('Replaced 1 color(s) in 1 file(s); 0 without a matching token, 4 skipped.');
  });

  it('EC-2: empty stdin does not hang — multi-match skipped, single-match still replaced', () => {
    write(tmp, '_variables.scss', '$primary-blue: #0052cc;\n' + WHITE_TOKENS);
    write(tmp, 'src/app.scss', 'a { color: #fff; border-color: #0052cc; }');

    const { stdout, status } = fix(tmp, [], '');

    expect(status).toBe(0);
    expect(read(tmp, 'src/app.scss')).toBe('a { color: #fff; border-color: $primary-blue; }');
    expect(lastLine(stdout)).toBe('Replaced 1 color(s) in 1 file(s); 0 without a matching token, 1 skipped.');
  });
});

describe('color-lint-fix — file-type safety and token files', { timeout: 60_000 }, () => {
  it('AC-13: .ts, .js and .html files are never edited', () => {
    write(tmp, '_variables.scss', '$primary-blue: #0052cc;');
    write(tmp, 'src/app.ts', "const c = '#0052cc';");
    write(tmp, 'src/app.js', "const c = '#0052cc';");
    write(tmp, 'src/index.html', '<p style="color: #0052cc"></p>');
    const before = snapshot(tmp);

    fix(tmp);

    expect(snapshot(tmp)).toEqual(before);
  });

  it('EC-7: neither a --tokens file inside the tree nor auto-discovered _variables*.scss files are modified', () => {
    write(tmp, 'tokens/colors.scss', '$primary-blue: #0052cc;\n$brand: #0052cc;');
    write(tmp, 'styles/_variables.scss', '$white: #fff;\n$snow: #fff;');
    write(tmp, 'styles/_variables-new.scss', '$paper: #fff;');
    write(tmp, 'src/app.scss', 'a { color: #0052cc; }');

    fix(tmp, ['-t', 'tokens/colors.scss'], '1\n1\n1\n');
    expect(read(tmp, 'tokens/colors.scss')).toBe('$primary-blue: #0052cc;\n$brand: #0052cc;');

    fix(tmp, [], '1\n1\n1\n');
    expect(read(tmp, 'styles/_variables.scss')).toBe('$white: #fff;\n$snow: #fff;');
    expect(read(tmp, 'styles/_variables-new.scss')).toBe('$paper: #fff;');
  });
});

describe('color-lint-fix — CLI contract', { timeout: 60_000 }, () => {
  it('AC-14: exits 0 even when violations remain', () => {
    write(tmp, '_variables.scss', WHITE_TOKENS);
    write(tmp, 'src/app.scss', 'a { color: #fff; border-color: #123456; }');

    const { status, stdout } = fix(tmp, [], '');

    expect(lastLine(stdout)).toBe('Replaced 0 color(s) in 0 file(s); 1 without a matching token, 1 skipped.');
    expect(status).toBe(0);
  });

  it('AC-15: color-lint itself never modifies files', () => {
    write(tmp, '_variables.scss', '$primary-blue: #0052cc;');
    write(tmp, 'src/app.scss', 'a { color: #0052cc; }');
    const before = snapshot(tmp);

    lint(tmp);

    expect(snapshot(tmp)).toEqual(before);
  });

  it('EC-8: a missing --tokens file names the path on stderr, modifies nothing, exits 1', () => {
    write(tmp, '_variables.scss', '$primary-blue: #0052cc;');
    write(tmp, 'src/app.scss', 'a { color: #0052cc; }');
    const before = snapshot(tmp);

    const { stderr, status } = fix(tmp, ['--tokens', 'does-not-exist.scss']);

    expect(status).toBe(1);
    expect(stderr).toContain('does-not-exist.scss');
    expect(snapshot(tmp)).toEqual(before);
  });

  it('EC-9: with no token file, modifies nothing and reports every violation as without a matching token', () => {
    write(tmp, 'src/app.scss', 'a { color: #0052cc; background: #fff; }');
    const before = snapshot(tmp);

    const { stdout, status } = fix(tmp);

    expect(snapshot(tmp)).toEqual(before);
    expect(lastLine(stdout)).toBe('Replaced 0 color(s) in 0 file(s); 2 without a matching token, 0 skipped.');
    expect(status).toBe(0);
  });

  it('EC-11: an unparseable .scss file names that file on stderr, modifies no file, exits 1', () => {
    write(tmp, '_variables.scss', '$primary-blue: #0052cc;');
    write(tmp, 'src/a.scss', 'a { color: #0052cc; }');
    write(tmp, 'src/z-broken.scss', 'b { color: #0052cc;'); // unclosed block
    const before = snapshot(tmp);

    const { stderr, status } = fix(tmp);

    expect(status).toBe(1);
    expect(stderr).toContain('z-broken.scss');
    expect(snapshot(tmp)).toEqual(before);
  });
});

describe('color-lint-fix — output styling', { timeout: 60_000 }, () => {
  it('AC-16: header, violation line, candidates and prompt use color-lint\'s styling', () => {
    write(tmp, '_variables.scss', WHITE_TOKENS);
    write(tmp, 'src/app.scss', '.a {\n  color: #fff;\n}\n');

    // The line reportViolations() prints for the same violation, taken from a real color-lint run.
    const reported = lines(lint(tmp, [], { color: true }).stdout).find((l) => l.includes('Line 2, Col 3'));
    const { stdout } = fix(tmp, [], '1\n', { color: true });

    const out = lines(stdout);
    expect(out).toContain(color.underline.blueBright(`📄 ${path.join('src', 'app.scss')}`));
    expect(reported).toBeDefined();
    expect(out).toContain(reported);
    expect(out).toContain(`     1) ${color.green('$white')}`);
    expect(out).toContain(`     2) ${color.green('$surface-white')}`);
    expect(stdout).toContain(color.cyan(PROMPT_2));
  });

  it('AC-17: one header per file, indented violation blocks separated by a blank line', () => {
    write(tmp, '_variables.scss', WHITE_TOKENS);
    write(tmp, 'src/app.scss', '.a {\n  margin: 0;\n  padding: 0;\n  color: #fff;\n}\n.b {\n  margin: 0;\n  padding: 0;\n  color: #fff;\n}\n');

    const { stdout } = fix(tmp, [], '1\n1\n');

    const out = lines(stdout);
    expect(out.filter((l) => l === `📄 ${path.join('src', 'app.scss')}`)).toHaveLength(1);
    const first = out.indexOf('  ⚠  Line 4, Col 3  |  color: #fff');
    const second = out.indexOf('  ⚠  Line 9, Col 3  |  color: #fff');
    expect(first).toBeGreaterThanOrEqual(0);
    expect(out.slice(first, second)).toEqual([
      '  ⚠  Line 4, Col 3  |  color: #fff',
      '     1) $white',
      '     2) $surface-white',
      `     ${PROMPT_2} `,
      '',
    ]);
    expect(out.slice(second, second + 4)).toEqual([
      '  ⚠  Line 9, Col 3  |  color: #fff',
      '     1) $white',
      '     2) $surface-white',
      `     ${PROMPT_2} `,
    ]);
  });

  it('AC-18: a valid pick prints no outcome message', () => {
    write(tmp, '_variables.scss', WHITE_TOKENS);
    write(tmp, 'src/app.scss', 'a { color: #fff; }');

    const { stdout } = fix(tmp, [], '2\n');

    expect(stdout).toContain(PROMPT_2);
    expect(stdout).not.toMatch(/Replaced with|Skipped|Invalid choice/);
  });

  it('AC-19: summary counts are green / red / yellow; plain text without color', () => {
    const app = 'a { color: #0052cc; background: #fff; border-color: #123456; }';
    write(tmp, '_variables.scss', '$primary-blue: #0052cc;\n' + WHITE_TOKENS);
    write(tmp, 'src/app.scss', app);

    const colored = fix(tmp, [], 's\n', { color: true }).stdout;
    write(tmp, 'src/app.scss', app);
    const plain = fix(tmp, [], 's\n').stdout;

    expect(lastLine(colored)).toBe(
      `Replaced ${color.green('1')} color(s) in 1 file(s); ${color.red('1')} without a matching token, ${color.yellow('1')} skipped.`
    );
    expect(lastLine(plain)).toBe('Replaced 1 color(s) in 1 file(s); 1 without a matching token, 1 skipped.');
  });
});

describe('color-lint-fix — skip and invalid answers', { timeout: 60_000 }, () => {
  it('AC-20: `s` skips, prints a yellow "Skipped." line and counts it as skipped', () => {
    write(tmp, '_variables.scss', WHITE_TOKENS);
    write(tmp, 'src/app.scss', 'a { color: #fff; }');

    const plain = fix(tmp, [], 's\n').stdout;
    const colored = fix(tmp, [], 's\n', { color: true }).stdout;

    const out = lines(plain);
    const prompt = out.findIndex((l) => l.includes(PROMPT_2));
    expect(out[prompt + 1]).toBe('     Skipped.');
    expect(lines(colored)).toContain(`     ${color.yellow('Skipped.')}`);
    expect(read(tmp, 'src/app.scss')).toBe('a { color: #fff; }');
    expect(lastLine(plain)).toBe('Replaced 0 color(s) in 0 file(s); 0 without a matching token, 1 skipped.');
  });

  it('AC-21: an invalid answer skips with a yellow message and no second prompt', () => {
    write(tmp, '_variables.scss', WHITE_TOKENS);
    write(tmp, 'src/app.scss', 'a { color: #fff; }');

    const plain = fix(tmp, [], 'abc\n1\n').stdout;
    const colored = fix(tmp, [], 'abc\n', { color: true }).stdout;

    const out = lines(plain);
    const prompt = out.findIndex((l) => l.includes(PROMPT_2));
    expect(out[prompt + 1]).toBe('     Invalid choice, hence skipped.');
    expect(plain.split(PROMPT_2)).toHaveLength(2);
    expect(lines(colored)).toContain(`     ${color.yellow('Invalid choice, hence skipped.')}`);
    expect(read(tmp, 'src/app.scss')).toBe('a { color: #fff; }');
    expect(lastLine(plain)).toBe('Replaced 0 color(s) in 0 file(s); 0 without a matching token, 1 skipped.');
  });

  it('EC-12: s / q answers are trimmed and case-insensitive', () => {
    const app = 'a { color: #fff; }\nb { color: #fff; }\nc { color: #fff; }';
    write(tmp, '_variables.scss', WHITE_TOKENS);
    write(tmp, 'src/app.scss', app);

    const upper = fix(tmp, [], 'S\n  s  \nQ\n').stdout;
    expect(lines(upper).filter((l) => l === '     Skipped.')).toHaveLength(2);
    expect(upper).toContain('Stopped early: 1 violation(s) not processed.');

    const spaced = fix(tmp, [], '  q  \n').stdout;
    expect(spaced).toContain('Stopped early: 3 violation(s) not processed.');
    expect(read(tmp, 'src/app.scss')).toBe(app);
  });

  it('EC-14: EOF at a prompt is a skip, not a quit', () => {
    write(tmp, '_variables.scss', '$primary-blue: #0052cc;\n' + WHITE_TOKENS);
    write(tmp, 'src/app.scss', 'a { color: #fff; border-color: #0052cc; }');

    const { stdout, status } = fix(tmp, [], '');

    expect(stdout).toContain(PROMPT_2);
    expect(stdout).not.toContain('Stopped early');
    expect(read(tmp, 'src/app.scss')).toBe('a { color: #fff; border-color: $primary-blue; }');
    expect(lastLine(stdout)).toBe('Replaced 1 color(s) in 1 file(s); 0 without a matching token, 1 skipped.');
    expect(status).toBe(0);
  });
});

describe('color-lint-fix — stopping early', { timeout: 60_000 }, () => {
  it('AC-22: `q` keeps the picks made so far, leaves the rest unchanged, exits 0', () => {
    write(tmp, '_variables.scss', WHITE_TOKENS);
    write(tmp, 'src/app.scss', 'a { color: #fff; }\nb { color: #fff; }\nc { color: #fff; }');

    // The trailing `1` would replace the third color if `q` did not stop the run.
    const { status } = fix(tmp, [], '1\nq\n1\n');

    expect(read(tmp, 'src/app.scss')).toBe('a { color: $white; }\nb { color: #fff; }\nc { color: #fff; }');
    expect(status).toBe(0);
  });

  it('AC-23: a single-match replacement before the quit point is written; nothing after it is processed', () => {
    write(tmp, '_variables.scss', '$primary-blue: #0052cc;\n' + WHITE_TOKENS);
    write(tmp, 'src/a.scss', 'a { border-color: #0052cc; color: #fff; }');
    write(tmp, 'src/b.scss', 'b { border-color: #0052cc; }');

    fix(tmp, [], 'q\n');

    expect(read(tmp, 'src/a.scss')).toBe('a { border-color: $primary-blue; color: #fff; }');
    expect(read(tmp, 'src/b.scss')).toBe('b { border-color: #0052cc; }');
  });

  it('AC-24: a yellow "Stopped early" line precedes the summary, which counts only processed violations', () => {
    // Processed: #0052cc (replaced), #123456 (no match), first #fff (s → skipped).
    // Quit at the second #fff → not processed: it, #abcdef, and both violations in b.scss = 4.
    const a = 'a { border-color: #0052cc; outline-color: #123456; color: #fff; background: #fff; fill: #abcdef; }';
    write(tmp, '_variables.scss', '$primary-blue: #0052cc;\n' + WHITE_TOKENS);
    write(tmp, 'src/a.scss', a);
    write(tmp, 'src/b.scss', 'b { border-color: #0052cc; color: #fff; }');

    const plain = fix(tmp, [], 's\nq\n').stdout;
    write(tmp, 'src/a.scss', a);
    const colored = fix(tmp, [], 's\nq\n', { color: true }).stdout;

    const out = lines(plain.trim());
    expect(out.at(-2)).toBe('Stopped early: 4 violation(s) not processed.');
    expect(out.at(-1)).toBe('Replaced 1 color(s) in 1 file(s); 1 without a matching token, 1 skipped.');
    expect(lines(colored.trim()).at(-2)).toBe(color.yellow('Stopped early: 4 violation(s) not processed.'));
  });

  it('AC-25: SIGINT at a prompt writes the earlier pick, prints the stop line and summary, exits 130', () => {
    write(tmp, '_variables.scss', WHITE_TOKENS);
    write(tmp, 'src/app.scss', 'a { color: #fff; }\nb { color: #fff; }');
    // Delivers SIGINT the moment the second prompt is shown. process.emit rather than
    // child.kill('SIGINT'): on Windows, kill() terminates the child abruptly instead of signalling.
    const preload = path.join(tmp, 'sigint-at-second-prompt.js');
    fs.writeFileSync(preload, `
      let prompts = 0;
      const write = process.stdout.write.bind(process.stdout);
      process.stdout.write = (chunk, ...rest) => {
        const result = write(chunk, ...rest);
        if (String(chunk).includes('Pick a token') && ++prompts === 2) process.emit('SIGINT', 'SIGINT');
        return result;
      };
    `);

    const { stdout, status } = fix(tmp, [], '1\n', { preload });

    expect(read(tmp, 'src/app.scss')).toBe('a { color: $white; }\nb { color: #fff; }');
    const out = lines(stdout.trim());
    expect(out.at(-2)).toBe('Stopped early: 1 violation(s) not processed.');
    expect(out.at(-1)).toBe('Replaced 1 color(s) in 1 file(s); 0 without a matching token, 0 skipped.');
    expect(status).toBe(130);
  });

  it('EC-15: `q` at the very first prompt modifies nothing and counts every violation from there on', () => {
    write(tmp, '_variables.scss', '$primary-blue: #0052cc;\n' + WHITE_TOKENS);
    write(tmp, 'src/a.scss', 'a { color: #fff; border-color: #0052cc; }');
    write(tmp, 'src/b.scss', 'b { border-color: #0052cc; outline-color: #123456; }');
    const before = snapshot(tmp);

    const { stdout } = fix(tmp, [], 'q\n');

    expect(snapshot(tmp)).toEqual(before);
    expect(stdout).toContain('Stopped early: 4 violation(s) not processed.');
    expect(lastLine(stdout)).toBe('Replaced 0 color(s) in 0 file(s); 0 without a matching token, 0 skipped.');
  });
});
