import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

// Runs the real CLI (src/cli.ts via ts-node) with a temp dir as the target dir (process.cwd()),
// exactly as a user would run `color-lint` inside a RIB project.
const repoRoot = path.resolve(__dirname, '..');
const cliEntry = path.join(repoRoot, 'src', 'cli.ts');
const tsNodeRegister = require.resolve('ts-node/register/transpile-only', { paths: [repoRoot] });

function write(dir: string, rel: string, content: string): void {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function run(cwd: string, ...args: string[]) {
  const result = spawnSync(process.execPath, ['-r', tsNodeRegister, cliEntry, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', TS_NODE_PROJECT: path.join(repoRoot, 'tsconfig.json') },
  });
  return { stdout: result.stdout, stderr: result.stderr, status: result.status };
}

// The trimmed line printed directly after the violation line reporting `value`.
function lineAfterViolation(stdout: string, value: string): string | undefined {
  const lines = stdout.split(/\r?\n/);
  const i = lines.findIndex((l) => l.endsWith(`: ${value}`));
  return i === -1 ? undefined : lines[i + 1]?.trim();
}

let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'color-lint-cli-'));
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('color-lint — token source and suggestions', { timeout: 30_000 }, () => {
  it('AC-19: auto-discovers _variables.scss and prints its token as the suggestion', () => {
    write(tmp, 'styles/_variables.scss', '$primary-blue: #0052cc;');
    write(tmp, 'src/app.scss', 'a { color: #0052cc; }');

    const { stdout } = run(tmp);

    expect(stdout).toContain('Suggestion: $primary-blue');
  });

  it('AC-20: merges tokens from all discovered source-of-truth files', () => {
    write(tmp, 'styles/_variables.scss', '$primary-blue: #0052cc;');
    write(tmp, 'styles/_variables-new.scss', '$accent: #ff0000;');
    write(tmp, 'src/app.scss', 'a { color: #0052cc; }\nb { color: #ff0000; }');

    const { stdout } = run(tmp);

    expect(lineAfterViolation(stdout, '#0052cc')).toBe('Suggestion: $primary-blue');
    expect(lineAfterViolation(stdout, '#ff0000')).toBe('Suggestion: $accent');
  });

  it('AC-21: ignores token files inside excluded folders', () => {
    write(tmp, 'node_modules/lib/_variables.scss', '$primary-blue: #0052cc;');
    write(tmp, 'src/app.scss', 'a { color: #0052cc; }');

    const { stdout } = run(tmp);

    expect(stdout).toContain('color: #0052cc');
    expect(stdout).not.toContain('Suggestion:');
  });

  it('AC-22: --tokens loads tokens from the given file', () => {
    write(tmp, 'tokens/colors.scss', '$primary-blue: #0052cc;');
    write(tmp, 'src/app.scss', 'a { color: #0052cc; }');

    const { stdout } = run(tmp, '--tokens', 'tokens/colors.scss');

    expect(stdout).toContain('Suggestion: $primary-blue');
  });

  it('AC-23: --tokens replaces auto-discovery rather than adding to it', () => {
    write(tmp, '_variables.scss', '$old: #0052cc;');
    write(tmp, 'tokens/colors.scss', '$primary-blue: #0052cc;');
    write(tmp, 'src/app.scss', 'a { color: #0052cc; }');

    const { stdout } = run(tmp, '--tokens', 'tokens/colors.scss');

    expect(stdout).toContain('Suggestion: $primary-blue');
    expect(stdout).not.toContain('$old');
  });

  it('AC-24: a missing --tokens file is a fatal error that names the path and scans nothing', () => {
    write(tmp, 'src/app.scss', 'a { color: #0052cc; }');

    const { stdout, stderr, status } = run(tmp, '--tokens', 'does-not-exist.scss');

    expect(status).toBe(1);
    expect(stderr).toContain('does-not-exist.scss');
    expect(stdout).not.toContain('app.scss');
    expect(stdout).not.toContain('violation');
  });

  it('AC-25: with no token file and no flag, output has no suggestions and no error', () => {
    write(tmp, 'src/app.scss', 'a { color: #0052cc; }');

    const { stdout, stderr, status } = run(tmp);

    expect(stdout).toContain('color: #0052cc');
    expect(stdout).not.toContain('Suggestion:');
    expect(stderr).toBe('');
    expect(stdout).toContain('Found 1 violation(s) across 1 file(s).');
    expect(status).toBe(1);
  });

  it('AC-26: suggestions do not change the violation count or exit code', () => {
    write(tmp, 'src/app.scss', 'a { color: #0052cc; }\nb { color: #123456; }');
    const without = run(tmp);

    write(tmp, '_variables.scss', '$primary-blue: #0052cc;');
    const withTokens = run(tmp);

    expect(withTokens.stdout).toContain('Suggestion: $primary-blue');
    expect(withTokens.stdout).toContain('Found 2 violation(s) across 1 file(s).');
    expect(without.stdout).toContain('Found 2 violation(s) across 1 file(s).');
    expect(withTokens.status).toBe(1);
    expect(without.status).toBe(1);
  });

  it('EC-10: resolves a relative --tokens path against the current directory', () => {
    write(tmp, 'shared/colors.scss', '$primary-blue: #0052cc;');
    write(tmp, 'app/src/app.scss', 'a { color: #0052cc; }');

    const { stdout } = run(path.join(tmp, 'app'), '--tokens', '../shared/colors.scss');

    expect(stdout).toContain('Suggestion: $primary-blue');
  });

  it('EC-11: suggests tokens for violations in .ts and .html files too', () => {
    write(tmp, '_variables.scss', '$primary-blue: #0052cc;');
    write(tmp, 'src/app.ts', "const c = '#0052cc';");
    write(tmp, 'src/index.html', '<p style="color: #0052cc"></p>');

    const { stdout } = run(tmp);

    const lines = stdout.split(/\r?\n/);
    const violationLines = lines.map((l, i) => [l, i] as const).filter(([l]) => l.endsWith(': #0052cc'));
    expect(violationLines).toHaveLength(2);
    for (const [, i] of violationLines) expect(lines[i + 1].trim()).toBe('Suggestion: $primary-blue');
  });

  it('EC-12: an unparseable token file is a fatal error naming the file (auto-discovered and --tokens)', () => {
    write(tmp, 'styles/_variables.scss', 'a { color: #fff;'); // unclosed block
    write(tmp, 'tokens/broken.scss', 'a { color: #fff;');
    write(tmp, 'src/app.scss', 'a { margin: 0; }'); // no violations: exit 1 can only come from the token file

    const discovered = run(tmp);
    expect(discovered.status).toBe(1);
    expect(discovered.stderr).toContain('_variables.scss');

    const flagged = run(tmp, '--tokens', 'tokens/broken.scss');
    expect(flagged.status).toBe(1);
    expect(flagged.stderr).toContain('broken.scss');
  });

  it('AC-27: -t is the short form of --tokens', () => {
    write(tmp, 'tokens/colors.scss', '$primary-blue: #0052cc;');
    write(tmp, 'src/app.scss', 'a { color: #0052cc; }');

    const { stdout } = run(tmp, '-t', 'tokens/colors.scss');

    expect(lineAfterViolation(stdout, '#0052cc')).toBe('Suggestion: $primary-blue');
  });

  it('AC-40: the primary suggestion is the first-declared match regardless of context, with the others counted', () => {
    write(tmp, '_variables.scss', '$text-white: #fff;\n$button-bg: #fff;');
    write(tmp, 'src/app.scss', '.button { background: #fff; }');

    const { stdout } = run(tmp);

    expect(lineAfterViolation(stdout, '#fff')).toBe('Suggestion: $text-white (+1 more)');
  });

  it('AC-28: --variables is an unknown option — commander error, exit 1, nothing scanned', () => {
    write(tmp, 'tokens/colors.scss', '$primary-blue: #0052cc;');
    write(tmp, 'src/app.scss', 'a { color: #0052cc; }');

    const { stdout, stderr, status } = run(tmp, '--variables', 'tokens/colors.scss');

    expect(status).toBe(1);
    expect(stderr).toContain("unknown option '--variables'");
    expect(stdout).not.toContain('app.scss');
    expect(stdout).not.toContain('violation');
  });
});
