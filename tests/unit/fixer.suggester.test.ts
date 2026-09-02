import { describe, it, expect } from 'vitest';
import { suggestVariable } from '../../src/core/fixer/suggester';
import type { ColorLintConfig } from '../../src/core/fixer/config';

describe('VariableSuggester: suggestVariable', () => {
  const config: ColorLintConfig = {
    colorMap: {
      '#ff0000': '$color-red',
      '#00ff00': '$color-green',
      '#0000ff': '$color-blue',
      '#ffffff': '$color-white',
      'red': '$color-red',
      'blue': '$color-blue',
      'rgb(255, 0, 0)': '$color-red',
      'hsl(0, 100%, 50%)': '$color-red',
    },
    sourceOfTruth: [],
    defaultBehavior: 'strict',
  };

  it('suggests a variable for an exact hex color match', () => {
    const suggestion = suggestVariable('#ff0000', config);
    expect(suggestion).toBe('$color-red');
  });

  it('suggests a variable for a normalized hex color (case-insensitive)', () => {
    const suggestion = suggestVariable('#FF0000', config);
    expect(suggestion).toBe('$color-red');
  });

  it('suggests a variable for a named color (case-insensitive)', () => {
    expect(suggestVariable('red', config)).toBe('$color-red');
    expect(suggestVariable('RED', config)).toBe('$color-red');
    expect(suggestVariable('Blue', config)).toBe('$color-blue');
  });

  it('suggests a variable for rgb() colors', () => {
    const suggestion = suggestVariable('rgb(255, 0, 0)', config);
    expect(suggestion).toBe('$color-red');
  });

  it('suggests a variable for hsl() colors', () => {
    const suggestion = suggestVariable('hsl(0, 100%, 50%)', config);
    expect(suggestion).toBe('$color-red');
  });

  it('returns null if a color is not in the colorMap', () => {
    const suggestion = suggestVariable('#123456', config);
    expect(suggestion).toBeNull();
  });

  it('returns null if a color is not mapped (strict mode)', () => {
    const config2: ColorLintConfig = {
      ...config,
      defaultBehavior: 'strict',
    };
    const suggestion = suggestVariable('#999999', config2);
    expect(suggestion).toBeNull();
  });

  it('handles 3-digit hex by normalizing to 6-digit', () => {
    // #fff should normalize to #ffffff which is in colorMap as $color-white
    const suggestion = suggestVariable('#fff', config);
    expect(suggestion).toBe('$color-white');
  });

  it('handles whitespace in color input', () => {
    const suggestion = suggestVariable('  #ff0000  ', config);
    expect(suggestion).toBe('$color-red');
  });

  it('matches rgb(255, 0, 0) even if input is rgb(255 0 0) (different spacing)', () => {
    // This depends on normalization — the config has 'rgb(255, 0, 0)' but input is 'rgb(255 0 0)'
    // Both should normalize to the same hex, so they should match.
    const suggestion = suggestVariable('rgb(255 0 0)', config);
    expect(suggestion).toBe('$color-red');
  });
});
