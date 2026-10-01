import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import chalk from 'chalk';
import * as path from 'node:path';
import { reportViolations, warnTokenFile } from '../src/utils/reporter';
import { ColorViolation } from '../src/core/types';

const targetDir = path.resolve('/project');
const violation = (extra: Partial<ColorViolation> = {}): ColorViolation => ({
  file: path.join(targetDir, 'src', 'app.scss'),
  line: 4,
  column: 10,
  property: 'color',
  value: '#0052cc',
  ...extra,
});

let lines: string[];
let originalLevel: typeof chalk.level;

beforeEach(() => {
  originalLevel = chalk.level;
  chalk.level = 0; // plain text, so assertions are not coupled to ANSI codes
  lines = [];
  vi.spyOn(console, 'log').mockImplementation((msg: string) => { lines.push(msg); });
});

afterEach(() => {
  chalk.level = originalLevel;
  vi.restoreAllMocks();
});

const violationIndex = (line: number) => lines.findIndex((l) => l.includes(`Line ${line}, Col 10`));

describe('reportViolations — suggestions', () => {
  it('AC-16: prints the violation in today\'s format, then the suggestion on its own line', () => {
    reportViolations([violation({ suggestions: ['$primary-blue'] })], targetDir);
    const i = violationIndex(4);
    expect(lines[i]).toBe('  ⚠  Line 4, Col 10  |  color: #0052cc');
    expect(lines[i + 1]).toBe('     Suggestion: $primary-blue');
  });

  it('AC-17: names only the primary suggestion, followed by the count of the others', () => {
    reportViolations([violation({ value: '#ffffff', suggestions: ['$white', '$surface-white', '$bg-default'] })], targetDir);
    expect(lines[violationIndex(4) + 1]).toBe('     Suggestion: $white (+2 more)');
  });

  it('AC-18: prints no Suggestion line when there is no suggestion', () => {
    reportViolations([violation(), violation({ line: 5, suggestions: [] })], targetDir);
    expect(lines[violationIndex(4)]).toBe('  ⚠  Line 4, Col 10  |  color: #0052cc');
    expect(lines[violationIndex(5)]).toBe('  ⚠  Line 5, Col 10  |  color: #0052cc');
    expect(lines.some((l) => l.includes('Suggestion:'))).toBe(false);
  });
});

// Supports EC-23 / EC-24: the one warning line both binaries print for an unloadable discovered token file.
describe('warnTokenFile', () => {
  it('prints "Warning: <loadVariables error>. Its tokens are ignored." to stderr, not stdout', () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((msg: string) => { errors.push(msg); });

    warnTokenFile(new Error('Could not load design token file styles/_variables.scss: Unclosed block'));

    expect(errors).toEqual(['Warning: Could not load design token file styles/_variables.scss: Unclosed block. Its tokens are ignored.']);
    expect(lines).toEqual([]);
  });
});
