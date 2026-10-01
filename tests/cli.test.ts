import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync, execSync } from 'node:child_process';

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
    // A git repo, so `../shared` is inside the token-file boundary (AC-41); the subject here is the resolution.
    write(tmp, 'shared/colors.scss', '$primary-blue: #0052cc;');
    write(tmp, 'app/src/app.scss', 'a { color: #0052cc; }');
    execSync('git init', { cwd: tmp, stdio: 'ignore' });

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

  it('EC-12: an unparseable --tokens file is a fatal error naming the file, nothing scanned', () => {
    write(tmp, 'tokens/broken.scss', 'a { color: #fff;'); // unclosed block
    write(tmp, 'src/app.scss', 'a { color: #0052cc; }');

    const { stdout, stderr, status } = run(tmp, '--tokens', 'tokens/broken.scss');

    expect(stderr).toContain('broken.scss');
    expect(stdout).not.toContain('app.scss');
    expect(status).toBe(1);
  });

  it('EC-23: an unparseable auto-discovered token file is a warning; the scan continues with the other files', () => {
    write(tmp, 'styles/_variables.scss', 'a { color: #fff;'); // unclosed block
    write(tmp, 'styles/_variables-new.scss', '$primary-blue: #0052cc;');
    write(tmp, 'src/app.scss', 'a { color: #0052cc; }');

    const { stdout, stderr, status } = run(tmp);

    expect(stderr).toMatch(/Warning: Could not load design token file \S*[\\/]_variables\.scss.*\. Its tokens are ignored\./);
    expect(stderr).not.toContain('Fatal Error');
    expect(lineAfterViolation(stdout, '#0052cc')).toBe('Suggestion: $primary-blue');
    expect(status).toBe(1);
  });

  it('AC-41: a --tokens file outside the cwd but inside its git repo is allowed', () => {
    const repo = path.join(tmp, 'repo');
    write(repo, 'shared/colors.scss', '$primary-blue: #0052cc;');
    write(repo, 'app/a.scss', 'a { color: #0052cc; }');
    execSync('git init', { cwd: repo, stdio: 'ignore' });

    const { stdout, stderr } = run(path.join(repo, 'app'), '-t', '../shared/colors.scss');

    expect(lineAfterViolation(stdout, '#0052cc')).toBe('Suggestion: $primary-blue');
    expect(stderr).not.toContain('outside');
  });

  it('AC-42: a --tokens file outside the repository is a fatal error naming the path as typed', () => {
    const repo = path.join(tmp, 'repo');
    write(repo, 'a.scss', 'a { color: #0052cc; }');
    write(tmp, 'other/colors.scss', '$primary-blue: #0052cc;');
    execSync('git init', { cwd: repo, stdio: 'ignore' });

    const { stdout, stderr, status } = run(repo, '-t', '../other/colors.scss');

    expect(stderr).toContain('Fatal Error: Token file is outside the repository: ../other/colors.scss');
    expect(stdout).not.toContain('color: #0052cc');
    expect(status).toBe(1);
  });

  it('AC-44: an absolute --tokens path outside the repository is a fatal error', () => {
    const repo = path.join(tmp, 'repo');
    write(repo, 'a.scss', 'a { color: #0052cc; }');
    execSync('git init', { cwd: repo, stdio: 'ignore' });
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'color-lint-elsewhere-'));
    const abs = path.join(elsewhere, 'colors.scss');
    fs.writeFileSync(abs, '$primary-blue: #0052cc;');

    try {
      const { stderr, status } = run(repo, '-t', abs);

      expect(stderr).toContain(`Fatal Error: Token file is outside the repository: ${abs}`);
      expect(status).toBe(1);
    } finally {
      fs.rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it('AC-45: outside any git repo, a --tokens file outside the cwd is a fatal error', () => {
    const cwd = path.join(tmp, 'proj');
    write(cwd, 'a.scss', 'a { color: #0052cc; }');
    write(tmp, 'shared/colors.scss', '$primary-blue: #0052cc;');

    const { stderr, status } = run(cwd, '-t', '../shared/colors.scss');

    expect(stderr).toContain('Fatal Error: Token file is outside the current directory: ../shared/colors.scss');
    expect(status).toBe(1);
  });

  it('EC-22: the token-file boundary check runs before the existence check', () => {
    const repo = path.join(tmp, 'repo');
    fs.mkdirSync(repo);
    execSync('git init', { cwd: repo, stdio: 'ignore' });

    const { stderr, status } = run(repo, '-t', '../missing.scss');

    expect(stderr).toContain('Fatal Error: Token file is outside the repository: ../missing.scss');
    expect(stderr).not.toContain('file not found');
    expect(status).toBe(1);
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

// single-file PRD: -f / --file limits the run to one file, under the same rules as discovery.
describe('color-lint --file (single-file)', { timeout: 30_000 }, () => {
  it('AC-1: reports only the named file, counts 1 file, exits 1', () => {
    write(tmp, 'a.scss', 'a { color: #0052cc; }');
    write(tmp, 'b.scss', 'b { color: #ff0000; }'); // never reported

    const { stdout, status } = run(tmp, '-f', 'a.scss');

    expect(stdout).toContain('📄 a.scss');
    expect(stdout).not.toContain('b.scss');
    expect(stdout).toContain('across 1 file(s)');
    expect(status).toBe(1);
  });

  it('AC-3: a relative and an absolute path report the same violations under the same header', () => {
    write(tmp, 'src/a.scss', 'a { color: #0052cc; }');

    const rel = run(tmp, '-f', 'src/a.scss');
    const abs = run(tmp, '--file', path.join(tmp, 'src', 'a.scss'));

    expect(rel.stdout).toContain(`📄 ${path.join('src', 'a.scss')} (1 violation)`);
    expect(abs.stdout).toBe(rel.stdout);
  });

  it('AC-5: a clean file prints "No violations found across 1 file(s)" and exits 0', () => {
    write(tmp, 'clean.scss', 'a { margin: 0; }');
    write(tmp, 'dirty.scss', 'a { color: #ff0000; }'); // not named: must not affect the result

    const { stdout, status } = run(tmp, '-f', 'clean.scss');

    expect(stdout).toContain('No violations found across 1 file(s)');
    expect(status).toBe(0);
  });

  it('AC-7: --tokens still supplies the suggestion', () => {
    write(tmp, 'a.scss', 'a { color: #0052cc; }');
    write(tmp, 'tokens.scss', '$primary-blue: #0052cc;');

    const { stdout } = run(tmp, '-f', 'a.scss', '-t', 'tokens.scss');

    expect(lineAfterViolation(stdout, '#0052cc')).toBe('Suggestion: $primary-blue');
  });

  it('AC-9: without -t, tokens are still auto-discovered across the whole cwd', () => {
    write(tmp, 'a.scss', 'a { color: #0052cc; }');
    write(tmp, 'styles/_variables.scss', '$primary-blue: #0052cc;');

    const { stdout } = run(tmp, '-f', 'a.scss');

    expect(lineAfterViolation(stdout, '#0052cc')).toBe('Suggestion: $primary-blue');
  });

  it('AC-10: without --file, every file is reported as today', () => {
    write(tmp, 'a.scss', 'a { color: #0052cc; }');
    write(tmp, 'b.scss', 'b { color: #ff0000; }');

    const { stdout, status } = run(tmp);

    expect(stdout).toContain('📄 a.scss');
    expect(stdout).toContain('📄 b.scss');
    expect(stdout).toContain('across 2 file(s)');
    expect(status).toBe(1);
  });

  it('EC-1: a missing file is a fatal error naming it', () => {
    const { stderr, status } = run(tmp, '-f', 'missing.scss');

    expect(stderr).toContain('Fatal Error: File not found: missing.scss');
    expect(status).toBe(1);
  });

  it('EC-3: --file with --changed is a fatal error, even outside a git repo', () => {
    write(tmp, 'a.scss', 'a { color: #0052cc; }');

    const { stdout, stderr, status } = run(tmp, '-f', 'a.scss', '-c');

    expect(stderr).toContain('Fatal Error: Use either --file or --changed, not both.');
    expect(stdout).not.toContain('violation');
    expect(status).toBe(1);
  });

  it('EC-5: an unsupported extension is skipped with a reason, exit 0', () => {
    write(tmp, 'notes.md', '#ff0000');

    const { stdout, status } = run(tmp, '-f', 'notes.md');

    expect(stdout).toContain('Skipped notes.md: not a scannable file type.');
    expect(stdout).not.toContain('violation');
    expect(status).toBe(0);
  });

  it('EC-6: a file in an excluded folder is skipped with a reason, exit 0', () => {
    write(tmp, 'node_modules/lib/x.scss', 'a { color: #ff0000; }');

    const { stdout, status } = run(tmp, '-f', 'node_modules/lib/x.scss');

    expect(stdout).toContain('Skipped node_modules/lib/x.scss: inside an excluded folder.');
    expect(stdout).not.toContain('violation');
    expect(status).toBe(0);
  });

  it('EC-7: a source-of-truth file is skipped with a reason, exit 0', () => {
    write(tmp, '_variables.scss', '$primary-blue: #0052cc;');

    const { stdout, status } = run(tmp, '-f', '_variables.scss');

    expect(stdout).toContain('Skipped _variables.scss: source-of-truth token file.');
    expect(stdout).not.toContain('violation');
    expect(status).toBe(0);
  });

  it('EC-8: a .ts file is scanned and its violation reported', () => {
    write(tmp, 'app.ts', "const c = '#ff0000';");

    const { stdout, status } = run(tmp, '-f', 'app.ts');

    expect(stdout).toContain('📄 app.ts');
    expect(stdout).toContain('#ff0000');
    expect(status).toBe(1);
  });

  it('EC-12: a directory is a fatal error', () => {
    fs.mkdirSync(path.join(tmp, 'src'));

    const { stderr, status } = run(tmp, '-f', 'src');

    expect(stderr).toContain('Fatal Error: Not a file: src');
    expect(status).toBe(1);
  });

  it('EC-13: a relative path outside the cwd is a fatal error naming the path as typed', () => {
    const cwd = path.join(tmp, 'root');
    fs.mkdirSync(cwd);
    write(tmp, 'outside/x.scss', 'a { color: #ff0000; }');

    const { stdout, stderr, status } = run(cwd, '-f', '../outside/x.scss');

    expect(stderr).toContain('Fatal Error: File is outside the current directory: ../outside/x.scss');
    expect(stdout).not.toContain('violation');
    expect(status).toBe(1);
  });

  it('EC-15: an absolute path outside the cwd is a fatal error', () => {
    const cwd = path.join(tmp, 'root');
    fs.mkdirSync(cwd);
    write(tmp, 'other/x.scss', 'a { color: #ff0000; }');
    const abs = path.join(tmp, 'other', 'x.scss');

    const { stderr, status } = run(cwd, '-f', abs);

    expect(stderr).toContain(`Fatal Error: File is outside the current directory: ${abs}`);
    expect(status).toBe(1);
  });

  it('EC-16: a `..` path that resolves back inside the cwd is scanned, header relative to the cwd', () => {
    const cwd = path.join(tmp, 'proj');
    write(tmp, 'proj/a.scss', 'a { color: #ff0000; }');

    const { stdout, status } = run(cwd, '-f', '../proj/a.scss');

    expect(stdout).toContain('📄 a.scss (1 violation)');
    expect(status).toBe(1);
  });

  it('EC-17: --tokens outside the cwd is still allowed alongside --file', () => {
    const repo = path.join(tmp, 'repo');
    const cwd = path.join(repo, 'app');
    write(repo, 'shared/tokens.scss', '$primary-blue: #0052cc;');
    write(cwd, 'a.scss', 'a { color: #0052cc; }');
    execSync('git init', { cwd: repo, stdio: 'ignore' });

    const { stdout, stderr, status } = run(cwd, '-f', 'a.scss', '-t', '../shared/tokens.scss');

    expect(lineAfterViolation(stdout, '#0052cc')).toBe('Suggestion: $primary-blue');
    expect(stderr).not.toContain('outside');
    expect(status).toBe(1);
  });

  it('EC-18: the outside check runs before the existence check', () => {
    const cwd = path.join(tmp, 'root');
    fs.mkdirSync(cwd);

    const { stderr, status } = run(cwd, '-f', '../missing.scss');

    expect(stderr).toContain('Fatal Error: File is outside the current directory: ../missing.scss');
    expect(stderr).not.toContain('File not found');
    expect(status).toBe(1);
  });
});

// suggest-css-variable PRD (2026-10-01): without -t, token auto-discovery searches the whole git repo.
describe('color-lint — repo-wide token discovery', { timeout: 30_000 }, () => {
  it('AC-46: from a repo subdirectory, a token file elsewhere in the repo is discovered', () => {
    const repo = path.join(tmp, 'repo');
    write(repo, 'styles/_variables.scss', '$primary-blue: #0052cc;'); // outside the cwd, inside the repo
    write(repo, 'app/a.scss', 'a { color: #0052cc; }');
    execSync('git init', { cwd: repo, stdio: 'ignore' });

    const { stdout } = run(path.join(repo, 'app'));

    expect(lineAfterViolation(stdout, '#0052cc')).toBe('Suggestion: $primary-blue');
  });

  it('AC-48: outside any git repo, discovery does not look above the cwd', () => {
    const cwd = path.join(tmp, 'proj');
    write(tmp, 'styles/_variables.scss', '$primary-blue: #0052cc;'); // next to the cwd, not under it
    write(cwd, 'a.scss', 'a { color: #0052cc; }');

    const { stdout, stderr } = run(cwd);

    expect(stdout).toContain('color: #0052cc');
    expect(stdout).not.toContain('Suggestion:');
    expect(stderr).toBe('');
  });

  it('AC-49: token files inside excluded folders anywhere in the repo are ignored', () => {
    const repo = path.join(tmp, 'repo');
    write(repo, 'node_modules/pkg/_variables.scss', '$primary-blue: #0052cc;'); // excluded folder
    write(repo, 'app/a.scss', 'a { color: #0052cc; }');
    execSync('git init', { cwd: repo, stdio: 'ignore' });

    const { stdout } = run(path.join(repo, 'app'));

    expect(stdout).toContain('color: #0052cc');
    expect(stdout).not.toContain('Suggestion:');
  });

  it('AC-50: only files under the cwd are scanned, even though tokens come from the whole repo', () => {
    const repo = path.join(tmp, 'repo');
    write(repo, 'styles/_variables.scss', '$primary-blue: #0052cc;');
    write(repo, 'app/a.scss', 'a { color: #0052cc; }');
    write(repo, 'other/b.scss', 'b { color: #ff0000; }'); // in the repo, outside the cwd: not scanned
    execSync('git init', { cwd: repo, stdio: 'ignore' });

    const { stdout } = run(path.join(repo, 'app'));

    expect(stdout).toContain('a.scss');
    expect(stdout).not.toContain('b.scss');
    expect(stdout).not.toContain('other');
    expect(stdout).toContain('Found 1 violation(s) across 1 file(s).');
  });

  it('EC-25: discovered files load in sorted path order; the file under the cwd gets no priority', () => {
    const repo = path.join(tmp, 'repo');
    write(repo, 'app/_variables.scss', '$app-white: #fff;');
    write(repo, 'styles/_variables.scss', '$base-white: #fff;');
    write(repo, 'app/a.scss', 'a { color: #fff; }');
    execSync('git init', { cwd: repo, stdio: 'ignore' });

    const { stdout } = run(path.join(repo, 'app'));

    expect(lineAfterViolation(stdout, '#fff')).toBe('Suggestion: $app-white (+1 more)');
  });

  it('EC-26: an unparseable token file elsewhere in the repo is a warning; the scan continues', () => {
    const repo = path.join(tmp, 'repo');
    write(repo, 'legacy/_variables.scss', 'a { color: #fff;'); // unclosed block
    write(repo, 'styles/_variables-new.scss', '$primary-blue: #0052cc;');
    write(repo, 'app/a.scss', 'a { color: #0052cc; }');
    execSync('git init', { cwd: repo, stdio: 'ignore' });

    const { stdout, stderr, status } = run(path.join(repo, 'app'));

    expect(stderr).toMatch(/Warning: Could not load design token file \S*legacy[\/]_variables\.scss.*\. Its tokens are ignored\./);
    expect(lineAfterViolation(stdout, '#0052cc')).toBe('Suggestion: $primary-blue');
    expect(status).toBe(1);
  });

  it('EC-27: when the cwd is the repo root, discovery behaves as before', () => {
    const repo = path.join(tmp, 'repo');
    write(repo, 'styles/_variables.scss', '$primary-blue: #0052cc;');
    write(repo, 'src/app.scss', 'a { color: #0052cc; }');
    execSync('git init', { cwd: repo, stdio: 'ignore' });

    const { stdout } = run(repo);

    expect(stdout).toContain('Suggestion: $primary-blue');
  });
});
