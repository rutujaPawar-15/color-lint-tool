import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execSync } from 'node:child_process';
import { fixFiles, resolveFixMode, type FixOptions } from '../../src/core/fixer/fixer';
import type { ColorLintConfig } from '../../src/core/fixer/config';

const tmpDirs: string[] = [];

function makeTmpDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function writeFile(dir: string, relPath: string, content: string): string {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
  return full;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('resolveFixMode', () => {
  it('defaults to auto-replace when neither flag is set', () => {
    expect(resolveFixMode(false, false)).toBe('auto-replace');
  });

  it('returns suggestions-only when only --suggestions-only is set', () => {
    expect(resolveFixMode(true, false)).toBe('suggestions-only');
  });

  it('returns dry-run when only --dry-run is set', () => {
    expect(resolveFixMode(false, true)).toBe('dry-run');
  });

  it('prefers dry-run when both flags are set (per PRD §4.3)', () => {
    expect(resolveFixMode(true, true)).toBe('dry-run');
  });
});

describe('Fixer: fixFiles', () => {
  const config: ColorLintConfig = {
    colorMap: {
      '#ff0000': '$color-red',
      '#00ff00': '$color-green',
      'red': '$color-red',
    },
    sourceOfTruth: [],
    defaultBehavior: 'strict',
  };

  describe('suggestions-only mode', () => {
    it('returns suggestions without modifying files', async () => {
      const dir = makeTmpDir('fixer-suggestions-');
      writeFile(dir, 'src/button.scss', '.button { color: #ff0000; }');
      writeFile(dir, 'src/card.scss', '.card { background: #ff0000; }');

      const options: FixOptions = {
        mode: 'suggestions-only',
      };

      const result = await fixFiles(dir, config, options);

      expect(result.mode).toBe('suggestions-only');
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBeGreaterThan(0);

      // Verify files were NOT modified
      const buttonContent = fs.readFileSync(path.join(dir, 'src/button.scss'), 'utf-8');
      expect(buttonContent).toContain('#ff0000');
      expect(buttonContent).not.toContain('$color-red');
    });

    it('groups suggestions by unique color and shows impact', async () => {
      const dir = makeTmpDir('fixer-suggestions-impact-');
      writeFile(dir, 'src/a.scss', 'color: #ff0000;');
      writeFile(dir, 'src/b.scss', 'color: #ff0000;');
      writeFile(dir, 'src/c.scss', 'color: #ff0000;');

      const options: FixOptions = {
        mode: 'suggestions-only',
      };

      const result = await fixFiles(dir, config, options);

      // Should have 3 suggestions (one per file), but same color maps to same variable
      expect(result.suggestions).toBeDefined();
      const redSuggestions = result.suggestions!.filter(s => s.value === '#ff0000');
      expect(redSuggestions.length).toBe(3);
      expect(redSuggestions.every(s => s.suggestedVariable === '$color-red')).toBe(true);
      // Each occurrence appears in 3 files total, so 2 OTHER files each.
      expect(redSuggestions.every(s => s.impactOtherFiles === 2)).toBe(true);
    });

    it('reports impactOtherFiles = 0 for a color appearing in only one file', async () => {
      const dir = makeTmpDir('fixer-suggestions-single-');
      writeFile(dir, 'src/only.scss', 'color: #ff0000;');

      const result = await fixFiles(dir, config, { mode: 'suggestions-only' });

      const redSuggestions = result.suggestions!.filter(s => s.value === '#ff0000');
      expect(redSuggestions.length).toBe(1);
      expect(redSuggestions[0].impactOtherFiles).toBe(0);
    });

    it('counts distinct files, not occurrences, for impact (two hits in one file = 0 other files)', async () => {
      const dir = makeTmpDir('fixer-suggestions-samefile-');
      writeFile(dir, 'src/only.scss', 'color: #ff0000; border-color: #ff0000;');

      const result = await fixFiles(dir, config, { mode: 'suggestions-only' });

      const redSuggestions = result.suggestions!.filter(s => s.value === '#ff0000');
      expect(redSuggestions.length).toBe(2);
      expect(redSuggestions.every(s => s.impactOtherFiles === 0)).toBe(true);
    });
  });

  describe('dry-run mode', () => {
    it('shows what would change without modifying files', async () => {
      const dir = makeTmpDir('fixer-dryrun-');
      writeFile(dir, 'src/button.scss', '.button { color: #ff0000; }');

      const options: FixOptions = {
        mode: 'dry-run',
      };

      const result = await fixFiles(dir, config, options);

      expect(result.mode).toBe('dry-run');
      expect(result.changes).toBeDefined();
      expect(result.changes!.length).toBeGreaterThan(0);

      // Verify file was NOT modified
      const content = fs.readFileSync(path.join(dir, 'src/button.scss'), 'utf-8');
      expect(content).toContain('#ff0000');
      expect(content).not.toContain('$color-red');
    });

    it('returns before/after for each file change', async () => {
      const dir = makeTmpDir('fixer-dryrun-preview-');
      const filePath = writeFile(dir, 'src/button.scss', '.button { color: #ff0000; }');

      const options: FixOptions = {
        mode: 'dry-run',
      };

      const result = await fixFiles(dir, config, options);

      expect(result.changes).toBeDefined();
      expect(result.changes!.length).toBeGreaterThan(0);

      // Check that at least one change has the expected before/after
      const hasReplacedColor = result.changes!.some(
        c => c.before.includes('#ff0000') && c.after.includes('$color-red')
      );
      expect(hasReplacedColor).toBe(true);
    });

    it('reports per-line diffs with 1-based line numbers for only the changed lines', async () => {
      const dir = makeTmpDir('fixer-dryrun-linediff-');
      // The violation is on line 3, not line 1 — a naive "first 3 lines" preview would miss it.
      const filePath = writeFile(
        dir,
        'src/button.scss',
        '.button {\n  font-size: 12px;\n  color: #ff0000;\n}'
      );

      const result = await fixFiles(dir, config, { mode: 'dry-run' });

      const change = result.changes!.find(c => c.file.endsWith('button.scss'));
      expect(change).toBeDefined();
      expect(change!.lineDiffs).toBeDefined();
      // Exactly one line changed.
      expect(change!.lineDiffs.length).toBe(1);
      expect(change!.lineDiffs[0].line).toBe(3);
      expect(change!.lineDiffs[0].before).toBe('  color: #ff0000;');
      expect(change!.lineDiffs[0].after).toBe('  color: $color-red;');
    });
  });

  describe('auto-replace mode', () => {
    it('actually modifies files and returns result', async () => {
      const dir = makeTmpDir('fixer-replace-');
      const filePath = writeFile(dir, 'src/button.scss', '.button { color: #ff0000; }');

      const options: FixOptions = {
        mode: 'auto-replace',
      };

      const result = await fixFiles(dir, config, options);

      expect(result.mode).toBe('auto-replace');
      expect(result.filesModified).toBeGreaterThan(0);

      // Verify file WAS modified
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).not.toContain('#ff0000');
      expect(content).toContain('$color-red');
    });

    it('only writes files if content actually changed', async () => {
      const dir = makeTmpDir('fixer-replace-nochange-');
      const filePath = writeFile(dir, 'src/button.scss', '.button { color: #0000ff; }');
      const mtime1 = fs.statSync(filePath).mtime.getTime();

      // Small delay to ensure mtime would differ if file were written
      await new Promise(resolve => setTimeout(resolve, 10));

      const options: FixOptions = {
        mode: 'auto-replace',
      };

      await fixFiles(dir, config, options);

      const mtime2 = fs.statSync(filePath).mtime.getTime();
      expect(mtime1).toBe(mtime2); // File NOT modified (no blue in colorMap)
    });

    it('returns count of violations found and replaced', async () => {
      const dir = makeTmpDir('fixer-replace-count-');
      writeFile(dir, 'src/a.scss', 'color: #ff0000; background: #ff0000;');
      writeFile(dir, 'src/b.scss', 'border: #ff0000;');

      const options: FixOptions = {
        mode: 'auto-replace',
      };

      const result = await fixFiles(dir, config, options);

      expect(result.violationsFound).toBe(3);
      expect(result.violationsReplaced).toBe(3);
      expect(result.violationsSkipped).toBe(0);
    });
  });

  describe('cross-file consistency', () => {
    it('suggests the same variable for the same color across multiple files', async () => {
      const dir = makeTmpDir('fixer-consistency-');
      writeFile(dir, 'src/a.scss', 'color: #ff0000;');
      writeFile(dir, 'src/b.scss', 'background: #ff0000;');

      const options: FixOptions = {
        mode: 'suggestions-only',
      };

      const result = await fixFiles(dir, config, options);

      const suggestions = result.suggestions!.filter(s => s.value === '#ff0000');
      expect(suggestions.every(s => s.suggestedVariable === '$color-red')).toBe(true);
    });
  });

  describe('error handling', () => {
    it('skips files that cannot be read', async () => {
      const dir = makeTmpDir('fixer-error-read-');
      const filePath = writeFile(dir, 'src/button.scss', 'color: #ff0000;');

      // Make file unreadable (if possible on this OS)
      try {
        fs.chmodSync(filePath, 0o000);
      } catch {
        // Skip this test if chmod doesn't work (e.g., Windows)
        return;
      }

      const options: FixOptions = {
        mode: 'suggestions-only',
      };

      const result = await fixFiles(dir, config, options);

      // Should handle error gracefully and continue
      expect(result).toBeDefined();

      // Restore permissions for cleanup
      fs.chmodSync(filePath, 0o644);
    });

    it('reports write errors but continues processing other files', async () => {
      const dir = makeTmpDir('fixer-error-write-');
      writeFile(dir, 'src/button.scss', 'color: #ff0000;');
      writeFile(dir, 'src/card.scss', 'color: #ff0000;');

      const options: FixOptions = {
        mode: 'auto-replace',
      };

      const result = await fixFiles(dir, config, options);

      // Should still complete (at least one file processed)
      expect(result.violationsFound).toBeGreaterThan(0);
    });
  });

  describe('respecting sourceOfTruth files', () => {
    it('does not flag colors in sourceOfTruth files as violations', async () => {
      const dir = makeTmpDir('fixer-sourceoftruth-');
      writeFile(dir, 'src/styles/_variables.scss', '$color-red: #ff0000;');
      writeFile(dir, 'src/button.scss', 'color: #ff0000;');

      const configWithSoT: ColorLintConfig = {
        ...config,
        sourceOfTruth: [path.join(dir, 'src/styles/_variables.scss')],
      };

      const options: FixOptions = {
        mode: 'suggestions-only',
      };

      const result = await fixFiles(dir, configWithSoT, options);

      // Should find violation in button.scss but not in _variables.scss
      expect(result.suggestions).toBeDefined();
      const violationFiles = result.suggestions!.map(s => s.file);
      expect(violationFiles.some(f => f.includes('button.scss'))).toBe(true);
      expect(violationFiles.every(f => !f.includes('_variables.scss'))).toBe(true);
    });

    it('marks a suggested variable as NOT missing when it is defined in a sourceOfTruth file', async () => {
      const dir = makeTmpDir('fixer-var-defined-');
      writeFile(dir, 'styles/_variables.scss', '$color-red: #ff0000;');
      writeFile(dir, 'src/button.scss', '.button { border: #ff0000; }');

      const configWithSoT: ColorLintConfig = {
        ...config,
        sourceOfTruth: [path.join(dir, 'styles/_variables.scss')],
      };

      const result = await fixFiles(dir, configWithSoT, { mode: 'suggestions-only' });

      const s = result.suggestions!.find(x => x.value === '#ff0000');
      expect(s!.suggestedVariable).toBe('$color-red');
      expect(s!.variableMissing).toBe(false);
    });

    it('marks a suggested variable as missing when it is NOT defined in any sourceOfTruth file', async () => {
      const dir = makeTmpDir('fixer-var-missing-');
      // sourceOfTruth defines a DIFFERENT variable, so $color-red is undefined.
      writeFile(dir, 'styles/_variables.scss', '$color-blue: #0000ff;');
      writeFile(dir, 'src/button.scss', '.button { border: #ff0000; }');

      const configWithSoT: ColorLintConfig = {
        ...config,
        sourceOfTruth: [path.join(dir, 'styles/_variables.scss')],
      };

      const result = await fixFiles(dir, configWithSoT, { mode: 'suggestions-only' });

      const s = result.suggestions!.find(x => x.value === '#ff0000');
      expect(s!.suggestedVariable).toBe('$color-red');
      expect(s!.variableMissing).toBe(true);
    });

    it('never marks an unmapped color (no suggestion) as a missing variable', async () => {
      const dir = makeTmpDir('fixer-var-unmapped-');
      writeFile(dir, 'styles/_variables.scss', '$color-red: #ff0000;');
      writeFile(dir, 'src/button.scss', '.button { border: #999999; }'); // not in colorMap

      const configWithSoT: ColorLintConfig = {
        ...config,
        sourceOfTruth: [path.join(dir, 'styles/_variables.scss')],
      };

      const result = await fixFiles(dir, configWithSoT, { mode: 'suggestions-only' });

      const s = result.suggestions!.find(x => x.value === '#999999');
      expect(s!.suggestedVariable).toBeNull();
      expect(s!.variableMissing).toBe(false);
    });
  });

  describe('unmapped colors', () => {
    it('skips colors that are not in the colorMap (strict mode)', async () => {
      const dir = makeTmpDir('fixer-unmapped-');
      writeFile(dir, 'src/button.scss', 'color: #999999;'); // not in colorMap

      const options: FixOptions = {
        mode: 'suggestions-only',
      };

      const result = await fixFiles(dir, config, options);

      // Should find the violation but have no suggestion
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions!.length).toBe(1);
      expect(result.suggestions![0].suggestedVariable).toBeNull();
    });

    it('in auto-replace mode, reports unmapped colors as skipped', async () => {
      const dir = makeTmpDir('fixer-unmapped-replace-');
      writeFile(dir, 'src/button.scss', 'color: #999999; border: #ff0000;');

      const options: FixOptions = {
        mode: 'auto-replace',
      };

      const result = await fixFiles(dir, config, options);

      expect(result.violationsFound).toBe(2);
      expect(result.violationsReplaced).toBe(1); // only red is mapped
      expect(result.violationsSkipped).toBe(1); // #999999 is not mapped
    });
  });

  describe('changed-files mode', () => {
    it('scans only git-changed files, not the whole tree', async () => {
      const dir = makeTmpDir('fixer-changed-');
      execSync('git init -q', { cwd: dir });
      execSync('git config user.email "test@example.com"', { cwd: dir });
      execSync('git config user.name "Test"', { cwd: dir });

      // Committed and untouched — must NOT be scanned in --changed mode.
      writeFile(dir, 'src/committed.scss', '.a { color: #ff0000; }');
      execSync('git add -A', { cwd: dir });
      execSync('git commit -q -m "initial"', { cwd: dir });

      // Untracked (new) file — SHOULD be scanned in --changed mode.
      writeFile(dir, 'src/new.scss', '.b { color: #ff0000; }');

      const result = await fixFiles(dir, config, { mode: 'suggestions-only', changed: true });

      // Only the untracked file's violation should appear.
      expect(result.violationsFound).toBe(1);
      expect(result.suggestions!.every(s => s.file.includes('new.scss'))).toBe(true);
    });

    it('auto-replaces colors only in changed files', async () => {
      const dir = makeTmpDir('fixer-changed-replace-');
      execSync('git init -q', { cwd: dir });
      execSync('git config user.email "test@example.com"', { cwd: dir });
      execSync('git config user.name "Test"', { cwd: dir });

      const committed = writeFile(dir, 'src/committed.scss', '.a { color: #ff0000; }');
      execSync('git add -A', { cwd: dir });
      execSync('git commit -q -m "initial"', { cwd: dir });

      const changed = writeFile(dir, 'src/new.scss', '.b { color: #ff0000; }');

      await fixFiles(dir, config, { mode: 'auto-replace', changed: true });

      // Committed file untouched; new file fixed.
      expect(fs.readFileSync(committed, 'utf-8')).toContain('#ff0000');
      expect(fs.readFileSync(changed, 'utf-8')).toContain('$color-red');
    });
  });
});
