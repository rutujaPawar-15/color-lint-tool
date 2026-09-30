import { describe, it, expect, vi, afterEach } from 'vitest';
import { reportViolations } from '../../src/utils/reporter';
import { ColorViolation } from '../../src/core/types';

// Strip ANSI color codes so assertions match on plain text.
// eslint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\[[0-9;]*m/g, '');

function captureOutput(violations: ColorViolation[]): string {
  const lines: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((msg?: unknown) => {
    lines.push(stripAnsi(String(msg ?? '')));
  });
  reportViolations(violations, '/project');
  spy.mockRestore();
  return lines.join('\n');
}

const base: ColorViolation = {
  file: '/project/src/button.scss',
  line: 3,
  column: 10,
  value: '#fff',
  property: 'color',
};

describe('reportViolations', () => {
  afterEach(() => vi.restoreAllMocks());

  it('prints suggestions on their own indented line below the violation', () => {
    const out = captureOutput([{ ...base, suggestions: ['var(--color-white)'] }]);
    const lines = out.split('\n');
    const violationLine = lines.findIndex((l) => l.includes('color: #fff'));
    expect(violationLine).toBeGreaterThanOrEqual(0);
    // The suggestion is NOT on the violation line...
    expect(lines[violationLine]).not.toContain('→');
    // ...but on the following line, indented, with an arrow.
    expect(lines[violationLine + 1]).toContain('→');
    expect(lines[violationLine + 1]).toContain('var(--color-white)');
    expect(lines[violationLine + 1]).toMatch(/^\s+→/);
  });

  it('shows the first match plus a "(+N more)" summary when several match', () => {
    const out = captureOutput([
      { ...base, suggestions: ['$color-white', 'var(--bg-surface)', 'var(--icon-bg)'] },
    ]);
    expect(out).toContain('$color-white');
    expect(out).toContain('(+2 more)');
    // The other tokens are NOT listed out.
    expect(out).not.toContain('var(--bg-surface)');
    expect(out).not.toContain('var(--icon-bg)');
  });

  it('summarizes a large match set as first + count on a single line', () => {
    const many = Array.from({ length: 30 }, (_, i) => `var(--token-number-${i})`);
    const out = captureOutput([{ ...base, suggestions: many }]);
    const suggestionLines = out.split('\n').filter((l) => l.includes('→'));
    // A single suggestion line, indented, first token + "(+29 more)".
    expect(suggestionLines.length).toBe(1);
    expect(suggestionLines[0]).toMatch(/^\s+→/);
    expect(suggestionLines[0]).toContain('var(--token-number-0)');
    expect(suggestionLines[0]).toContain('(+29 more)');
    // Later tokens are not printed.
    expect(out).not.toContain('var(--token-number-1)');
  });

  it('omits "(+N more)" when only one token matches', () => {
    const out = captureOutput([{ ...base, suggestions: ['$only'] }]);
    expect(out).toContain('$only');
    expect(out).not.toContain('more)');
  });

  it('renders no arrow / no extra line when there are no suggestions', () => {
    const out = captureOutput([{ ...base, suggestions: [] }]);
    expect(out).toContain('color: #fff');
    expect(out).not.toContain('→');
  });

  it('renders no arrow when suggestions is undefined', () => {
    const out = captureOutput([{ ...base }]);
    expect(out).not.toContain('→');
  });

  it('prints nothing for an empty violation list', () => {
    const out = captureOutput([]);
    expect(out).toBe('');
  });
});
