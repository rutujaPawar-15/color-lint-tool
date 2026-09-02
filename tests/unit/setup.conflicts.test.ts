import { describe, it, expect } from 'vitest';
import { detectColorConflicts } from '../../src/core/setup/extractor';
import type { VariableDefinition } from '../../src/core/setup/extractor';

function def(name: string, normalizedColor: string): VariableDefinition {
  return { name, rawColor: normalizedColor, normalizedColor };
}

describe('detectColorConflicts', () => {
  it('reports a color defined by two different variables', () => {
    const defs = [def('$color-red', '#ff0000'), def('$color-danger', '#ff0000')];
    const conflicts = detectColorConflicts(defs);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].normalizedColor).toBe('#ff0000');
    expect(conflicts[0].variables).toEqual(['$color-red', '$color-danger']);
  });

  it('returns no conflicts when every color maps to a single variable', () => {
    const defs = [def('$color-red', '#ff0000'), def('$color-blue', '#0000ff')];
    expect(detectColorConflicts(defs)).toEqual([]);
  });

  it('does not report a conflict when the same variable/color pair repeats', () => {
    // The identical name+color appearing twice is a duplicate, not a conflict.
    const defs = [def('$color-red', '#ff0000'), def('$color-red', '#ff0000')];
    expect(detectColorConflicts(defs)).toEqual([]);
  });

  it('detects conflicts across different spellings of the same color', () => {
    // rgb(255,0,0) and #ff0000 normalize to the same color -> conflict.
    const defs = [
      { name: '$a', rawColor: '#ff0000', normalizedColor: '#ff0000' },
      { name: '$b', rawColor: 'rgb(255, 0, 0)', normalizedColor: '#ff0000' },
    ];
    const conflicts = detectColorConflicts(defs);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].variables).toEqual(['$a', '$b']);
  });
});
