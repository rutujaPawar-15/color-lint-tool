import { describe, it, expect } from 'vitest';
import { enrichViolationsWithSuggestions } from '../../src/core/fixer/suggester';
import type { ColorViolation } from '../../src/core/types';
import type { ColorLintConfig } from '../../src/core/fixer/config';

describe('enrichViolationsWithSuggestions', () => {
  const sampleConfig: ColorLintConfig = {
    colorMap: {
      '#ff0000': '$color-red',
      '#00ff00': '$color-green',
      'red': '$color-red',
      '#123456': '$color-missing',
    },
    sourceOfTruth: ['_variables.scss'],
    defaultBehavior: 'strict',
  };

  it('enriches mapped color violations with their suggested variable', () => {
    const violations: ColorViolation[] = [
      { file: 'a.scss', line: 1, column: 1, property: 'color', value: '#ff0000' },
      { file: 'b.scss', line: 5, column: 2, property: 'background', value: '#00ff00' },
    ];
    const defined = new Set(['$color-red', '$color-green']);

    const result = enrichViolationsWithSuggestions(violations, sampleConfig, defined);

    expect(result.length).toBe(2);
    expect(result[0].suggestedVariable).toBe('$color-red');
    expect(result[0].variableMissing).toBe(false);
    expect(result[1].suggestedVariable).toBe('$color-green');
    expect(result[1].variableMissing).toBe(false);
  });

  it('sets suggestedVariable to null for unmapped colors', () => {
    const violations: ColorViolation[] = [
      { file: 'a.scss', line: 1, column: 1, property: 'color', value: '#999999' },
    ];

    const result = enrichViolationsWithSuggestions(violations, sampleConfig, new Set());

    expect(result.length).toBe(1);
    expect(result[0].suggestedVariable).toBeNull();
    expect(result[0].variableMissing).toBe(false);
  });

  it('flags variableMissing as true when suggested variable is not in definedVariables', () => {
    const violations: ColorViolation[] = [
      { file: 'a.scss', line: 1, column: 1, property: 'color', value: '#123456' },
    ];
    // '$color-missing' is NOT in definedVariables
    const defined = new Set(['$color-red']);

    const result = enrichViolationsWithSuggestions(violations, sampleConfig, defined);

    expect(result.length).toBe(1);
    expect(result[0].suggestedVariable).toBe('$color-missing');
    expect(result[0].variableMissing).toBe(true);
  });

  it('handles empty violations array', () => {
    const result = enrichViolationsWithSuggestions([], sampleConfig, new Set());
    expect(result).toEqual([]);
  });
});
